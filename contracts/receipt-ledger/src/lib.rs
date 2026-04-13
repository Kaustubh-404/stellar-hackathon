#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Receipt {
    pub receipt_id: String,
    pub payer: Address,
    pub payee: Address,
    pub service_id: String,
    pub amount: i128,
    pub request_hash: BytesN<32>,
    pub response_hash: BytesN<32>,
    pub timestamp: u64,
    pub status: u32, // 0 = success, 1 = failure, 2 = disputed
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Dispute {
    pub receipt_id: String,
    pub disputer: Address,
    pub reason: String,
    pub timestamp: u64,
    pub resolved: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Receipt(String),
    PayerReceipts(Address),
    PayeeReceipts(Address),
    AllReceipts,
    ReceiptCount,
    Dispute(String),
}

#[contract]
pub struct ReceiptLedgerContract;

#[contractimpl]
impl ReceiptLedgerContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ReceiptCount, &0u64);
        let empty: Vec<String> = Vec::new(&env);
        env.storage().instance().set(&DataKey::AllReceipts, &empty);
    }

    pub fn post_receipt(
        env: Env,
        payer: Address,
        payee: Address,
        service_id: String,
        amount: i128,
        request_hash: BytesN<32>,
        response_hash: BytesN<32>,
        receipt_id: String,
    ) {
        payee.require_auth();

        let key = DataKey::Receipt(receipt_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("receipt already exists");
        }

        let receipt = Receipt {
            receipt_id: receipt_id.clone(),
            payer: payer.clone(),
            payee: payee.clone(),
            service_id,
            amount,
            request_hash,
            response_hash,
            timestamp: env.ledger().timestamp(),
            status: 0,
        };

        env.storage().persistent().set(&key, &receipt);

        // Index by payer
        let payer_key = DataKey::PayerReceipts(payer.clone());
        let mut payer_receipts: Vec<String> = env
            .storage()
            .persistent()
            .get(&payer_key)
            .unwrap_or(Vec::new(&env));
        payer_receipts.push_back(receipt_id.clone());
        env.storage().persistent().set(&payer_key, &payer_receipts);

        // Index by payee
        let payee_key = DataKey::PayeeReceipts(payee.clone());
        let mut payee_receipts: Vec<String> = env
            .storage()
            .persistent()
            .get(&payee_key)
            .unwrap_or(Vec::new(&env));
        payee_receipts.push_back(receipt_id.clone());
        env.storage().persistent().set(&payee_key, &payee_receipts);

        // All receipts index
        let mut all: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::AllReceipts)
            .unwrap_or(Vec::new(&env));
        all.push_back(receipt_id.clone());
        env.storage().instance().set(&DataKey::AllReceipts, &all);

        // Increment count
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ReceiptCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::ReceiptCount, &(count + 1));

        env.events().publish(
            (symbol_short!("receipt"), payer),
            (payee, amount),
        );
    }

    pub fn get_receipt(env: Env, receipt_id: String) -> Receipt {
        let key = DataKey::Receipt(receipt_id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("receipt not found")
    }

    pub fn get_payer_receipts(env: Env, payer: Address, limit: u32) -> Vec<Receipt> {
        let payer_key = DataKey::PayerReceipts(payer);
        let ids: Vec<String> = env
            .storage()
            .persistent()
            .get(&payer_key)
            .unwrap_or(Vec::new(&env));

        let mut results = Vec::new(&env);
        let start = if limit > 0 && ids.len() > limit {
            ids.len() - limit
        } else {
            0
        };

        for i in start..ids.len() {
            let rid = ids.get(i).unwrap();
            if let Some(r) = env
                .storage()
                .persistent()
                .get::<DataKey, Receipt>(&DataKey::Receipt(rid))
            {
                results.push_back(r);
            }
        }
        results
    }

    pub fn get_payee_receipts(env: Env, payee: Address, limit: u32) -> Vec<Receipt> {
        let payee_key = DataKey::PayeeReceipts(payee);
        let ids: Vec<String> = env
            .storage()
            .persistent()
            .get(&payee_key)
            .unwrap_or(Vec::new(&env));

        let mut results = Vec::new(&env);
        let start = if limit > 0 && ids.len() > limit {
            ids.len() - limit
        } else {
            0
        };

        for i in start..ids.len() {
            let rid = ids.get(i).unwrap();
            if let Some(r) = env
                .storage()
                .persistent()
                .get::<DataKey, Receipt>(&DataKey::Receipt(rid))
            {
                results.push_back(r);
            }
        }
        results
    }

    pub fn dispute_receipt(env: Env, disputer: Address, receipt_id: String, reason: String) {
        disputer.require_auth();

        let rkey = DataKey::Receipt(receipt_id.clone());
        let mut receipt: Receipt = env
            .storage()
            .persistent()
            .get(&rkey)
            .expect("receipt not found");

        if receipt.payer != disputer {
            panic!("only payer can dispute");
        }

        receipt.status = 2; // disputed
        env.storage().persistent().set(&rkey, &receipt);

        let dispute = Dispute {
            receipt_id: receipt_id.clone(),
            disputer: disputer.clone(),
            reason,
            timestamp: env.ledger().timestamp(),
            resolved: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(receipt_id.clone()), &dispute);

        env.events().publish(
            (symbol_short!("dispute"), disputer),
            receipt_id,
        );
    }

    pub fn get_receipt_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ReceiptCount)
            .unwrap_or(0)
    }

    pub fn get_recent_receipts(env: Env, limit: u32) -> Vec<Receipt> {
        let all: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::AllReceipts)
            .unwrap_or(Vec::new(&env));

        let mut results = Vec::new(&env);
        let start = if limit > 0 && all.len() > limit {
            all.len() - limit
        } else {
            0
        };

        for i in start..all.len() {
            let rid = all.get(i).unwrap();
            if let Some(r) = env
                .storage()
                .persistent()
                .get::<DataKey, Receipt>(&DataKey::Receipt(rid))
            {
                results.push_back(r);
            }
        }
        results
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_post_and_get_receipt() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ReceiptLedgerContract, ());
        let client = ReceiptLedgerContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let sid = String::from_str(&env, "weather_v1");
        let rid = String::from_str(&env, "receipt_001");
        let req_hash = BytesN::from_array(&env, &[1u8; 32]);
        let res_hash = BytesN::from_array(&env, &[2u8; 32]);

        client.post_receipt(&payer, &payee, &sid, &10000, &req_hash, &res_hash, &rid);

        let receipt = client.get_receipt(&rid);
        assert_eq!(receipt.amount, 10000);
        assert_eq!(receipt.status, 0);
        assert_eq!(client.get_receipt_count(), 1);
    }

    #[test]
    fn test_dispute() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ReceiptLedgerContract, ());
        let client = ReceiptLedgerContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let sid = String::from_str(&env, "test_svc");
        let rid = String::from_str(&env, "receipt_002");
        let req_hash = BytesN::from_array(&env, &[3u8; 32]);
        let res_hash = BytesN::from_array(&env, &[4u8; 32]);

        client.post_receipt(&payer, &payee, &sid, &5000, &req_hash, &res_hash, &rid);

        let reason = String::from_str(&env, "bad data returned");
        client.dispute_receipt(&payer, &rid, &reason);

        let receipt = client.get_receipt(&rid);
        assert_eq!(receipt.status, 2);
    }
}
