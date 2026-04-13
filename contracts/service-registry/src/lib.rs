#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ServiceInfo {
    pub service_id: String,
    pub provider: Address,
    pub endpoint_url: String,
    pub price_per_call: i128,
    pub description: String,
    pub category: String,
    pub active: bool,
    pub total_calls: u64,
    pub total_earned: i128,
    pub registered_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Service(String),
    ProviderServices(Address),
    CategoryServices(String),
    AllServices,
    ServiceCount,
}

#[contract]
pub struct ServiceRegistryContract;

#[contractimpl]
impl ServiceRegistryContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ServiceCount, &0u64);
        let empty_ids: Vec<String> = Vec::new(&env);
        env.storage().instance().set(&DataKey::AllServices, &empty_ids);
    }

    pub fn register_service(
        env: Env,
        provider: Address,
        service_id: String,
        endpoint_url: String,
        price_per_call: i128,
        description: String,
        category: String,
    ) {
        provider.require_auth();

        let key = DataKey::Service(service_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("service already exists");
        }

        let info = ServiceInfo {
            service_id: service_id.clone(),
            provider: provider.clone(),
            endpoint_url,
            price_per_call,
            description,
            category: category.clone(),
            active: true,
            total_calls: 0,
            total_earned: 0,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &info);

        // Add to all services index
        let mut all: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::AllServices)
            .unwrap_or(Vec::new(&env));
        all.push_back(service_id.clone());
        env.storage().instance().set(&DataKey::AllServices, &all);

        // Add to provider index
        let pkey = DataKey::ProviderServices(provider.clone());
        let mut provider_services: Vec<String> = env
            .storage()
            .persistent()
            .get(&pkey)
            .unwrap_or(Vec::new(&env));
        provider_services.push_back(service_id.clone());
        env.storage().persistent().set(&pkey, &provider_services);

        // Add to category index
        let ckey = DataKey::CategoryServices(category.clone());
        let mut cat_services: Vec<String> = env
            .storage()
            .persistent()
            .get(&ckey)
            .unwrap_or(Vec::new(&env));
        cat_services.push_back(service_id.clone());
        env.storage().persistent().set(&ckey, &cat_services);

        // Increment count
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ServiceCount)
            .unwrap_or(0);
        env.storage().instance().set(&DataKey::ServiceCount, &(count + 1));

        env.events().publish(
            (symbol_short!("register"), provider),
            service_id,
        );
    }

    pub fn update_service(
        env: Env,
        provider: Address,
        service_id: String,
        price_per_call: i128,
        active: bool,
    ) {
        provider.require_auth();

        let key = DataKey::Service(service_id.clone());
        let mut info: ServiceInfo = env
            .storage()
            .persistent()
            .get(&key)
            .expect("service not found");

        if info.provider != provider {
            panic!("not the provider");
        }

        info.price_per_call = price_per_call;
        info.active = active;
        env.storage().persistent().set(&key, &info);

        env.events().publish(
            (symbol_short!("update"), provider),
            service_id,
        );
    }

    pub fn get_service(env: Env, service_id: String) -> ServiceInfo {
        let key = DataKey::Service(service_id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("service not found")
    }

    pub fn list_services(env: Env, category: String, limit: u32) -> Vec<ServiceInfo> {
        let ckey = DataKey::CategoryServices(category);
        let ids: Vec<String> = env
            .storage()
            .persistent()
            .get(&ckey)
            .unwrap_or(Vec::new(&env));

        let mut results = Vec::new(&env);
        let max = if limit == 0 || limit > ids.len() {
            ids.len()
        } else {
            limit
        };

        for i in 0..max {
            let sid = ids.get(i).unwrap();
            let key = DataKey::Service(sid);
            if let Some(info) = env.storage().persistent().get::<DataKey, ServiceInfo>(&key) {
                if info.active {
                    results.push_back(info);
                }
            }
        }
        results
    }

    pub fn list_all_services(env: Env, limit: u32) -> Vec<ServiceInfo> {
        let all: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::AllServices)
            .unwrap_or(Vec::new(&env));

        let mut results = Vec::new(&env);
        let max = if limit == 0 || limit > all.len() {
            all.len()
        } else {
            limit
        };

        for i in 0..max {
            let sid = all.get(i).unwrap();
            let key = DataKey::Service(sid);
            if let Some(info) = env.storage().persistent().get::<DataKey, ServiceInfo>(&key) {
                if info.active {
                    results.push_back(info);
                }
            }
        }
        results
    }

    pub fn record_call(env: Env, caller: Address, service_id: String, amount: i128) {
        caller.require_auth();

        let key = DataKey::Service(service_id.clone());
        let mut info: ServiceInfo = env
            .storage()
            .persistent()
            .get(&key)
            .expect("service not found");

        info.total_calls += 1;
        info.total_earned += amount;
        env.storage().persistent().set(&key, &info);

        env.events().publish(
            (symbol_short!("call"), caller),
            (service_id, amount),
        );
    }

    pub fn get_service_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ServiceCount)
            .unwrap_or(0)
    }

    pub fn get_provider_services(env: Env, provider: Address) -> Vec<String> {
        let pkey = DataKey::ProviderServices(provider);
        env.storage()
            .persistent()
            .get(&pkey)
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_register_and_get() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ServiceRegistryContract, ());
        let client = ServiceRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let provider = Address::generate(&env);
        let sid = String::from_str(&env, "weather_v1");
        let url = String::from_str(&env, "http://localhost:3001");
        let desc = String::from_str(&env, "Weather data API");
        let cat = String::from_str(&env, "weather");

        client.register_service(&provider, &sid, &url, &10000, &desc, &cat);

        let info = client.get_service(&sid);
        assert_eq!(info.price_per_call, 10000);
        assert_eq!(info.active, true);
        assert_eq!(info.total_calls, 0);
        assert_eq!(client.get_service_count(), 1);
    }
}
