use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogRow {
    pub model_name: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub quota: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelAgg {
    pub total_tokens: u64,
    pub quota: u64,
}

pub fn quota_to_cny(quota: u64, quota_per_unit: u64) -> f64 {
    if quota_per_unit == 0 {
        return 0.0;
    }
    quota as f64 / quota_per_unit as f64
}

/// New API `/api/user/self` returns `quota` as the current remaining balance.
/// `used_quota` is cumulative historical spend and must not be subtracted again.
pub fn remaining_cny(quota: u64, quota_per_unit: u64) -> f64 {
    quota_to_cny(quota, quota_per_unit)
}

pub fn is_low_balance(remaining: f64, threshold: f64) -> bool {
    remaining < threshold
}

pub fn aggregate_by_model(logs: &[LogRow]) -> HashMap<String, ModelAgg> {
    let mut map: HashMap<String, ModelAgg> = HashMap::new();
    for row in logs {
        let e = map.entry(row.model_name.clone()).or_default();
        e.total_tokens += row.prompt_tokens + row.completion_tokens;
        e.quota += row.quota;
    }
    map
}

/// Group tokens by local calendar day key `YYYY-MM-DD` from unix seconds.
pub fn aggregate_by_day(logs: &[LogRow]) -> HashMap<String, u64> {
    let mut map: HashMap<String, u64> = HashMap::new();
    for row in logs {
        let day = chrono_day_key(row.created_at);
        *map.entry(day).or_insert(0) += row.prompt_tokens + row.completion_tokens;
    }
    map
}

/// Group tokens by `(model_name, YYYY-MM-DD)`.
pub fn aggregate_by_model_day(logs: &[LogRow]) -> HashMap<(String, String), u64> {
    let mut map: HashMap<(String, String), u64> = HashMap::new();
    for row in logs {
        let day = chrono_day_key(row.created_at);
        let key = (row.model_name.clone(), day);
        *map.entry(key).or_insert(0) += row.prompt_tokens + row.completion_tokens;
    }
    map
}

fn chrono_day_key(ts: i64) -> String {
    use chrono::{Local, TimeZone};
    Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_to_cny_divides_by_unit() {
        assert!((quota_to_cny(1_000_000, 500_000) - 2.0).abs() < 1e-9);
        assert!((quota_to_cny(0, 500_000) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn remaining_cny_uses_quota_directly() {
        assert!((remaining_cny(2_500_000, 500_000) - 5.0).abs() < 1e-9);
    }

    #[test]
    fn is_low_balance_at_threshold() {
        assert!(is_low_balance(4.9, 5.0));
        assert!(!is_low_balance(5.0, 5.0));
    }

    #[test]
    fn aggregate_by_model_sums_tokens() {
        let logs = vec![
            LogRow {
                model_name: "gpt-x".into(),
                prompt_tokens: 10,
                completion_tokens: 5,
                quota: 100,
                created_at: 1,
            },
            LogRow {
                model_name: "gpt-x".into(),
                prompt_tokens: 3,
                completion_tokens: 2,
                quota: 40,
                created_at: 2,
            },
            LogRow {
                model_name: "claude-y".into(),
                prompt_tokens: 1,
                completion_tokens: 1,
                quota: 10,
                created_at: 3,
            },
        ];
        let m = aggregate_by_model(&logs);
        assert_eq!(m.get("gpt-x").unwrap().total_tokens, 20);
        assert_eq!(m.get("claude-y").unwrap().total_tokens, 2);
    }

    #[test]
    fn aggregate_by_model_day_splits_per_model() {
        // 2026-07-17 12:00 CST ≈ 1752724800 (approx); use local midnight via known offset-free approach:
        // two rows same day different models.
        let ts = chrono::Local::now().timestamp();
        let logs = vec![
            LogRow {
                model_name: "gpt-x".into(),
                prompt_tokens: 10,
                completion_tokens: 0,
                quota: 1,
                created_at: ts,
            },
            LogRow {
                model_name: "claude-y".into(),
                prompt_tokens: 7,
                completion_tokens: 0,
                quota: 1,
                created_at: ts,
            },
        ];
        let m = aggregate_by_model_day(&logs);
        let day = chrono_day_key(ts);
        assert_eq!(m.get(&("gpt-x".into(), day.clone())).copied().unwrap_or(0), 10);
        assert_eq!(m.get(&("claude-y".into(), day)).copied().unwrap_or(0), 7);
    }
}
