#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BudgetConfig {
    pub agent: Address,
    pub max_per_call: i128,
    pub max_per_session: i128,
    pub max_daily: i128,
    pub spent_session: i128,
    pub spent_daily: i128,
    pub daily_reset_at: u64,
    pub session_id: u64,
    pub total_spent: i128,
    pub total_calls: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SpendRecord {
    pub provider: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub service_id: soroban_sdk::String,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Budget(Address),
    AllowList(Address),
    BlockList(Address),
    SpendHistory(Address),
}

const DAY_SECONDS: u64 = 86400;

#[contract]
pub struct BudgetPolicyContract;

#[contractimpl]
impl BudgetPolicyContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_budget(
        env: Env,
        agent: Address,
        max_per_call: i128,
        max_per_session: i128,
        max_daily: i128,
    ) {
        agent.require_auth();

        let config = BudgetConfig {
            agent: agent.clone(),
            max_per_call,
            max_per_session,
            max_daily,
            spent_session: 0,
            spent_daily: 0,
            daily_reset_at: env.ledger().timestamp() + DAY_SECONDS,
            session_id: env.ledger().timestamp(),
            total_spent: 0,
            total_calls: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Budget(agent.clone()), &config);

        env.events().publish(
            (symbol_short!("budget"), agent),
            (max_per_call, max_daily),
        );
    }

    pub fn set_allow_list(env: Env, agent: Address, providers: Vec<Address>) {
        agent.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::AllowList(agent), &providers);
    }

    pub fn set_block_list(env: Env, agent: Address, providers: Vec<Address>) {
        agent.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::BlockList(agent), &providers);
    }

    pub fn check_allowed(env: Env, agent: Address, provider: Address, amount: i128) -> bool {
        let key = DataKey::Budget(agent.clone());
        let mut config: BudgetConfig = match env.storage().persistent().get(&key) {
            Some(c) => c,
            None => return true, // no budget set = allow all
        };

        // Reset daily counter if past reset time
        let now = env.ledger().timestamp();
        if now >= config.daily_reset_at {
            config.spent_daily = 0;
            config.daily_reset_at = now + DAY_SECONDS;
            env.storage().persistent().set(&key, &config);
        }

        // Check per-call limit
        if config.max_per_call > 0 && amount > config.max_per_call {
            return false;
        }

        // Check daily limit
        if config.max_daily > 0 && (config.spent_daily + amount) > config.max_daily {
            return false;
        }

        // Check session limit
        if config.max_per_session > 0 && (config.spent_session + amount) > config.max_per_session {
            return false;
        }

        // Check allow list
        let allow_key = DataKey::AllowList(agent.clone());
        if let Some(allow_list) = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<Address>>(&allow_key)
        {
            if allow_list.len() > 0 {
                let mut found = false;
                for i in 0..allow_list.len() {
                    if allow_list.get(i).unwrap() == provider {
                        found = true;
                        break;
                    }
                }
                if !found {
                    return false;
                }
            }
        }

        // Check block list
        let block_key = DataKey::BlockList(agent.clone());
        if let Some(block_list) = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<Address>>(&block_key)
        {
            for i in 0..block_list.len() {
                if block_list.get(i).unwrap() == provider {
                    return false;
                }
            }
        }

        true
    }

    pub fn record_spend(
        env: Env,
        agent: Address,
        provider: Address,
        amount: i128,
        service_id: soroban_sdk::String,
    ) {
        agent.require_auth();

        let key = DataKey::Budget(agent.clone());
        let mut config: BudgetConfig = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no budget configured");

        // Reset daily if needed
        let now = env.ledger().timestamp();
        if now >= config.daily_reset_at {
            config.spent_daily = 0;
            config.daily_reset_at = now + DAY_SECONDS;
        }

        config.spent_daily += amount;
        config.spent_session += amount;
        config.total_spent += amount;
        config.total_calls += 1;
        env.storage().persistent().set(&key, &config);

        // Record to spend history
        let hist_key = DataKey::SpendHistory(agent.clone());
        let mut history: Vec<SpendRecord> = env
            .storage()
            .persistent()
            .get(&hist_key)
            .unwrap_or(Vec::new(&env));

        history.push_back(SpendRecord {
            provider: provider.clone(),
            amount,
            timestamp: now,
            service_id,
        });

        // Keep last 50 records
        if history.len() > 50 {
            let new_start = history.len() - 50;
            let mut trimmed = Vec::new(&env);
            for i in new_start..history.len() {
                trimmed.push_back(history.get(i).unwrap());
            }
            history = trimmed;
        }

        env.storage().persistent().set(&hist_key, &history);

        env.events().publish(
            (symbol_short!("spend"), agent),
            (provider, amount),
        );
    }

    pub fn get_budget(env: Env, agent: Address) -> BudgetConfig {
        let key = DataKey::Budget(agent);
        env.storage()
            .persistent()
            .get(&key)
            .expect("no budget configured")
    }

    pub fn get_remaining(env: Env, agent: Address) -> (i128, i128) {
        let key = DataKey::Budget(agent.clone());
        let mut config: BudgetConfig = match env.storage().persistent().get(&key) {
            Some(c) => c,
            None => return (-1, -1), // -1 = unlimited
        };

        let now = env.ledger().timestamp();
        if now >= config.daily_reset_at {
            config.spent_daily = 0;
        }

        let daily_remaining = if config.max_daily > 0 {
            config.max_daily - config.spent_daily
        } else {
            -1
        };

        let session_remaining = if config.max_per_session > 0 {
            config.max_per_session - config.spent_session
        } else {
            -1
        };

        (daily_remaining, session_remaining)
    }

    pub fn reset_session(env: Env, agent: Address) {
        agent.require_auth();

        let key = DataKey::Budget(agent.clone());
        let mut config: BudgetConfig = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no budget configured");

        config.spent_session = 0;
        config.session_id = env.ledger().timestamp();
        env.storage().persistent().set(&key, &config);

        env.events().publish(
            (symbol_short!("reset"), agent),
            config.session_id,
        );
    }

    pub fn get_spend_history(env: Env, agent: Address) -> Vec<SpendRecord> {
        let hist_key = DataKey::SpendHistory(agent);
        env.storage()
            .persistent()
            .get(&hist_key)
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_budget_enforcement() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(BudgetPolicyContract, ());
        let client = BudgetPolicyContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let agent = Address::generate(&env);
        let provider = Address::generate(&env);

        // Set budget: 100 per call, 500 per session, 1000 daily
        client.set_budget(&agent, &100, &500, &1000);

        // 50 should be allowed
        assert_eq!(client.check_allowed(&agent, &provider, &50), true);

        // 150 should be blocked (exceeds per-call)
        assert_eq!(client.check_allowed(&agent, &provider, &150), false);

        // Record some spending
        let sid = soroban_sdk::String::from_str(&env, "test");
        client.record_spend(&agent, &provider, &50, &sid);

        let budget = client.get_budget(&agent);
        assert_eq!(budget.spent_daily, 50);
        assert_eq!(budget.total_calls, 1);
    }
}
