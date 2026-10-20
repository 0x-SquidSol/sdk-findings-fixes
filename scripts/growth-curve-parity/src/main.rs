//! Emits the continuous-leverage curve parity fixtures for @percolatorct/sdk by calling the
//! wrapper's OWN functions (percolator_prog::growth_v19 at the pinned commit). No re-implementation.
use percolator_prog::growth_v19 as g;

const MAX: u64 = u64::MAX;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        // xorshift64*
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn below(&mut self, n: u64) -> u64 {
        if n == 0 { 0 } else { self.next() % n }
    }
}

fn s(x: u64) -> String { format!("\"{}\"", x) }
fn s128(x: u128) -> String { format!("\"{}\"", x) }
fn opt_u32(x: Option<u32>) -> String { match x { Some(v) => v.to_string(), None => "null".into() } }
fn opt128(x: Option<u128>) -> String { match x { Some(v) => s128(v), None => "null".into() } }

fn log_uniform(r: &mut Rng, lo: u64, hi: u64) -> u64 {
    // pick a bit length in [bits(lo), bits(hi)] then a value in that octave clamped to [lo, hi]
    let lo = lo.max(1);
    let blo = 64 - lo.leading_zeros();
    let bhi = 64 - hi.leading_zeros();
    let b = blo + (r.below((bhi - blo + 1) as u64) as u32);
    let base = 1u64 << (b - 1);
    let v = base | (r.next() & (base - 1).max(0));
    v.clamp(lo, hi)
}

fn depths_for(th: [u64; 3], r: &mut Rng) -> Vec<u64> {
    let mut v: Vec<u64> = vec![0, 1, 2, 3, 4, 5, 7, 8, MAX, MAX - 1, MAX - 2];
    let a = g::curve_anchors(th);
    for &x in a.iter().chain(th.iter()) {
        for dlt in [-3i64, -2, -1, 0, 1, 2, 3] {
            let y = if dlt < 0 { x.checked_sub((-dlt) as u64) } else { x.checked_add(dlt as u64) };
            if let Some(y) = y { v.push(y); }
        }
        // the geometric mid-points between anchors and +-1 around them
    }
    for i in 0..3 {
        let (lo, hi) = (a[i], a[i + 1]);
        if lo > 0 && hi != MAX && hi > lo {
            let mid = ((lo as f64) * (hi as f64)).sqrt() as u64;
            for d in [mid.saturating_sub(1), mid, mid.saturating_add(1)] { v.push(d); }
            for _ in 0..60 { v.push(lo + r.below(hi - lo)); }
            for _ in 0..60 { v.push(log_uniform(r, lo, hi - 1)); }
        }
    }
    for k in 0..64u32 {
        let p = 1u64 << k;
        v.push(p);
        if p > 1 { v.push(p - 1); }
        v.push(p.saturating_add(1));
    }
    let top = if th[2] != MAX && th[2] < MAX / 4 { th[2] * 4 } else { MAX };
    // the lagging curve's top anchor 4·T3 (21b8ccfd, review M-1), saturating, +-3
    let lag_top = th[2].saturating_mul(g::KAPPA_LAG_TOP_MUL);
    for dlt in [-3i64, -2, -1, 0, 1, 2, 3] {
        let y = if dlt < 0 { lag_top.checked_sub((-dlt) as u64) } else { lag_top.checked_add(dlt as u64) };
        if let Some(y) = y { v.push(y); }
    }
    if th[2] > 0 && lag_top != MAX && lag_top > th[2] {
        let mid = ((th[2] as f64) * (lag_top as f64)).sqrt() as u64;
        for d in [mid.saturating_sub(1), mid, mid.saturating_add(1)] { v.push(d); }
        for _ in 0..60 { v.push(th[2] + r.below(lag_top - th[2])); }
        for _ in 0..60 { v.push(log_uniform(r, th[2], lag_top - 1)); }
    }
    for _ in 0..250 { v.push(log_uniform(r, 1, top)); }
    for _ in 0..40 { v.push(r.next()); }
    v.sort_unstable();
    v.dedup();
    v
}

fn main() {
    if let Ok(n) = std::env::var("BIG") {
        let seed = std::env::var("SEED").ok().and_then(|x| x.parse().ok()).unwrap_or(0xC0FFEE_u64);
        big(n.parse().expect("BIG=<cases>"), seed);
        return;
    }
    let commit = std::env::var("WRAPPER_COMMIT").unwrap_or_else(|_| "unknown".into());
    let mut r = Rng(0x9E3779B97F4A7C15);
    let e6 = 1_000_000u64;
    let e9 = 1_000_000_000u64;
    let configs: Vec<(&str, [u64; 3])> = vec![
        ("default_6dp", [25_000 * e6, 100_000 * e6, 500_000 * e6]),
        ("floor_6dp", [5_000 * e6, 20_000 * e6, 100_000 * e6]),
        ("default_9dp", [25_000 * e9, 100_000 * e9, 500_000 * e9]),
        ("floor_9dp", [5_000 * e9, 20_000 * e9, 100_000 * e9]),
        ("wide_6dp", [1_000 * e6, 1_000_000 * e6, 1_000_000_000 * e6]),
        ("tight", [100, 101, 102]),
        ("tiny_anchor0_zero", [1, 2, 3]),
        ("t1_below_4", [3, 1_000, 1_000_000]),
        ("small_then_huge", [4, 8, 1_000_000_000_000]),
        ("sat_t2_t3", [25_000 * e6, MAX, MAX]),
        ("sat_t3", [25_000 * e6, 100_000 * e6, MAX]),
        ("all_sat", [MAX, MAX, MAX]),
        ("non_increasing", [100, 100, 1_000]),
        ("huge", [1u64 << 62, 1u64 << 63, MAX - 1]),
        // the lagging top anchor 4·T3 (21b8ccfd): exactly representable / saturating by one / saturated
        ("lag_top_edge", [25_000 * e6, 100_000 * e6, MAX / 4]),
        ("lag_top_sat1", [25_000 * e6, 100_000 * e6, MAX / 4 + 1]),
        ("lag_top_sat", [25_000 * e6, 100_000 * e6, MAX / 2]),
    ];
    let tables: Vec<(&str, [u64; 4])> = vec![
        ("L_default", [500, 500, 1_000, 2_000]),
        ("L_launch2x", [200, 500, 1_000, 2_000]),
        ("L_flat5x", [500, 500, 500, 500]),
        ("L_100x", [500, 1_000, 5_000, 10_000]),
        ("L_u16max", [100, 2_500, 6_000, 65_535]),
        ("KAPPA", g::KAPPA_TABLE_BPS),
        ("LAMBDA_DEPTH", g::LAMBDA_DEPTH_TABLE_BPS),
        ("non_monotone", [500, 1_000, 700, 2_000]),
        ("wide_u128_path", [0, 1, 1u64 << 40, MAX]),
    ];
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str(&format!("\"meta\":{{\"source\":\"percolator-prog growth_v19 (curve_pos / curve_value / log2_q16 / curve_pos_lag / curve_lag_u64 / smooth_dials_and_venue_l / stress_cap_x100 + target_ceiling_x100 / venue_depth_capped / n_cap_g8_q_dials / growth_matcher_caps_g8_dials)\",\"wrapper_commit\":\"{}\",\"generator\":\"percolator-sdk scripts/growth-curve-parity\"}},\n", commit));
    // tables
    out.push_str("\"tables\":{");
    out.push_str(&tables.iter().map(|(n, t)| format!("\"{}\":[{}]", n, t.iter().map(|x| s(*x)).collect::<Vec<_>>().join(","))).collect::<Vec<_>>().join(","));
    out.push_str("},\n");
    // log2
    let mut lx: Vec<u64> = vec![0, 1, 2, 3, MAX, MAX - 1];
    for k in 0..64u32 { let p = 1u64 << k; lx.push(p); lx.push(p.wrapping_sub(1)); lx.push(p.saturating_add(1)); }
    for _ in 0..2_500 { let v = log_uniform(&mut r, 1, MAX); lx.push(v); }
    for _ in 0..500 { lx.push(r.next()); }
    for i in 0..1_000u64 { lx.push(i); }
    lx.sort_unstable(); lx.dedup();
    out.push_str("\"log2\":[");
    out.push_str(&lx.iter().map(|x| format!("[{},{}]", s(*x), opt_u32(g::log2_q16(*x)))).collect::<Vec<_>>().join(","));
    out.push_str("],\n");
    // curve configs
    out.push_str("\"curve\":[\n");
    let mut first = true;
    let mut total = 0usize;
    for (name, th) in &configs {
        let ds = depths_for(*th, &mut r);
        if !first { out.push_str(",\n"); }
        first = false;
        let a = g::curve_anchors(*th);
        out.push_str(&format!("{{\"name\":\"{}\",\"th\":[{}],\"anchors\":[{}],\"cases\":[", name,
            th.iter().map(|x| s(*x)).collect::<Vec<_>>().join(","), a.iter().map(|x| s(*x)).collect::<Vec<_>>().join(",")));
        let rows: Vec<String> = ds.iter().map(|d| {
            let p = g::curve_pos(*d, *th);
            let vals: Vec<String> = tables.iter().map(|(_, t)| {
                let v = g::curve_value(p, *t);
                assert_eq!(v, g::curve_u64(*d, *th, *t));
                s(v)
            }).collect();
            // the lagging position / values (κ / λ_depth since 21b8ccfd), every table
            let q = g::curve_pos_lag(p, *d, *th);
            let lvals: Vec<String> = tables.iter().map(|(_, t)| {
                let v = g::curve_value(q, *t);
                assert_eq!(v, g::curve_lag_u64(*d, *th, *t));
                s(v)
            }).collect();
            format!("[{},{},{},{},{},{},{},{},{}]", s(*d), p.seg, p.num, p.den, vals.join(","), q.seg, q.num, q.den, lvals.join(","))
        }).collect();
        total += rows.len();
        out.push_str(&rows.join(","));
        out.push_str("]}");
    }
    out.push_str("\n],\n");
    // fail position
    out.push_str(&format!("\"fail_pos\":{{\"seg\":{},\"num\":{},\"den\":{},\"values\":[{}]}},\n", g::CURVE_POS_FAIL.seg, g::CURVE_POS_FAIL.num, g::CURVE_POS_FAIL.den,
        tables.iter().map(|(_, t)| s(g::curve_value(g::CURVE_POS_FAIL, *t))).collect::<Vec<_>>().join(",")));
    // dials over (venue, book) pairs with u16 L tables (tier_leverage outputs)
    let lparams: Vec<([u16; 3], u16, u16)> = vec![
        ([0, 0, 0], 500, 2_000),
        ([0, 0, 0], 200, 2_000),
        ([750, 1_500, 5_000], 300, 5_000),
        ([0, 0, 0], 500, 1_000),
        ([2_000, 4_000, 10_000], 1_000, 10_000),
    ];
    let ltabs: Vec<[u16; 4]> = lparams.iter().map(|(st, la, lt)| g::tier_leverage(*st, *la, *lt)).collect();
    out.push_str("\"l_tables\":[");
    out.push_str(&ltabs.iter().map(|t| format!("[{},{},{},{}]", t[0], t[1], t[2], t[3])).collect::<Vec<_>>().join(","));
    out.push_str("],\n\"dials\":[");
    let mut rows = Vec::new();
    for (ci, (_, th)) in configs.iter().enumerate() {
        let ds = depths_for(*th, &mut r);
        for li in 0..ltabs.len() {
            for _ in 0..40 {
                let v = ds[r.below(ds.len() as u64) as usize];
                let b = ds[r.below(ds.len() as u64) as usize];
                let (d, vl) = g::smooth_dials_and_venue_l(v, b, *th, ltabs[li]);
                assert_eq!(d, g::smooth_dials(v, b, *th, ltabs[li]));
                rows.push(format!("[{},{},{},{},{},{},{},{}]", ci, li, s(v), s(b), d.l_signal_x100, d.kappa_bps, d.lambda_depth_bps, vl));
            }
        }
    }
    let ndials = rows.len();
    out.push_str(&rows.join(","));
    out.push_str("],\n\"venue_cap\":[");
    let mut rows = Vec::new();
    for (ci, (_, th)) in configs.iter().enumerate() {
        if th.iter().any(|x| *x == MAX) { continue; }
        let ds = depths_for(*th, &mut r);
        for src in [0u8, 1, 2, 3, 0x81, 0x82, 0x85] {
            for amt in [0u8, 1, 2, 3, 4, 9] {
                for _ in 0..3 {
                    let e = ds[r.below(ds.len() as u64) as usize];
                    rows.push(format!("[{},{},{},{},{}]", ci, src, amt, s(e), s(g::venue_depth_capped(e, src, *th, amt))));
                }
            }
        }
    }
    out.push_str(&rows.join(","));
    // stepped stress cap (21b8ccfd, review M-2) composed as growth_ceiling_x100 builds the target: tier = combined(venue tier, book tier),
    // dials at (venue, book), cap = stress_cap_x100(s, tier, table), target = target_ceiling_x100(graduation_on(clamp, band, tier), s, ...)
    out.push_str("],\n\"l_params\":[");
    out.push_str(&lparams.iter().map(|(st, la, lt)| format!("[[{},{},{}],{},{}]", st[0], st[1], st[2], la, lt)).collect::<Vec<_>>().join(","));
    out.push_str("],\n\"stress_target\":[");
    let mut rows = Vec::new();
    for (ci, (_, th)) in configs.iter().enumerate() {
        let ds = depths_for(*th, &mut r);
        for li in 0..ltabs.len() {
            for k in 0..60 {
                let v = ds[r.below(ds.len() as u64) as usize];
                // a third of the rows: venue = book (the signal and the tier move together across the anchors)
                let b = if k % 3 == 0 { v } else { ds[r.below(ds.len() as u64) as usize] };
                let (_, la, lt) = lparams[li];
                let tier = g::combined_tier(g::depth_tier_for(v, *th), g::depth_tier_for(b, *th));
                let d = g::smooth_dials(v, b, *th, ltabs[li]);
                let cells: Vec<String> = (0u8..=4).map(|st| {
                    let cap = g::stress_cap_x100(st, tier, ltabs[li]);
                    let t = g::target_ceiling_x100(g::graduation_on(true, 64, tier), st, la, lt, d.l_signal_x100, cap);
                    format!("{},{}", cap, t)
                }).collect();
                rows.push(format!("[{},{},{},{},{},{}]", ci, li, s(v), s(b), tier, cells.join(",")));
            }
        }
    }
    let nstress = rows.len();
    out.push_str(&rows.join(","));
    // N_cap / matcher caps at the curve dials (composition)
    out.push_str("],\n\"ncap\":[");
    let mut rows = Vec::new();
    let pos_scale: u128 = 1_000_000;
    for (ci, (_, th)) in configs.iter().enumerate().take(5) {
        let ds = depths_for(*th, &mut r);
        for _ in 0..200 {
            let v = ds[r.below(ds.len() as u64) as usize] % (th[2].saturating_mul(4).max(1));
            let b = ds[r.below(ds.len() as u64) as usize] % (th[2].saturating_mul(4).max(1));
            let cm: u128 = (r.below(2_000_000) as u128) * 1_000_000;
            let lam: u32 = [5_000u32, 10_000, 20_000, 50_000, 100_000][r.below(5) as usize];
            let price: u64 = [1u64, 1_000, 150_000_000, 1_000_000, 7_654_321][r.below(5) as usize];
            let li = r.below(ltabs.len() as u64) as usize;
            let cap_depth = if r.below(5) == 0 { None } else { Some(v) };
            let (d, _) = g::smooth_dials_and_venue_l(v, b, *th, ltabs[li]);
            let n = g::n_cap_g8_q_dials(true, cm, lam, d.lambda_depth_bps, d.kappa_bps, cap_depth, price, pos_scale);
            let (cl, cs) = g::growth_matcher_caps_g8_dials(false, true, cm, lam, d.lambda_depth_bps, d.kappa_bps, cap_depth, price, pos_scale, 100_000_000_000_000);
            rows.push(format!("[{},{},{},{},{},{},{},{},{},{},{}]", ci, li, s(v), s(b), s128(cm), lam,
                match cap_depth { Some(x) => s(x), None => "null".into() }, s(price), opt128(n), s128(cl), s128(cs)));
        }
    }
    out.push_str(&rows.join(","));
    out.push_str("]\n}\n");
    print!("{}", out);
    eprintln!("log2 {} curve-rows {} dials {} stress-target-rows {}", lx.len(), total, ndials, nstress);
}

/// BIG=N mode: N random differential cases as JSONL on stdout (not committed; checked by scripts/growth-curve-diff.ts).
/// 40% of the depths sit within +-8 atoms of a leading anchor [T1/4, T1, T2, T3] or the lagging top anchor 4·T3.
fn big(n: u64, seed: u64) {
    use std::io::Write;
    let mut r = Rng(seed | 1);
    let e6 = 1_000_000u64;
    let fixed: [[u64; 3]; 6] = [
        [25_000 * e6, 100_000 * e6, 500_000 * e6],
        [5_000 * e6, 20_000 * e6, 100_000 * e6],
        [25_000_000 * e6, 100_000_000 * e6, 500_000_000 * e6],
        [25_000 * e6, 100_000 * e6, MAX / 4],
        [25_000 * e6, 100_000 * e6, MAX / 4 + 1],
        [25_000 * e6, MAX, MAX],
    ];
    let out = std::io::stdout();
    let mut w = std::io::BufWriter::new(out.lock());
    for _ in 0..n {
        let th: [u64; 3] = if r.below(2) == 0 {
            fixed[r.below(fixed.len() as u64) as usize]
        } else {
            let mut t = [log_uniform(&mut r, 1, 1u64 << 62), log_uniform(&mut r, 1, 1u64 << 62), log_uniform(&mut r, 1, MAX)];
            t.sort_unstable();
            if r.below(10) == 0 { t[2] = MAX; }
            if r.below(20) == 0 { t[1] = t[0]; }
            t
        };
        let anchors = [th[0] / 4, th[0], th[1], th[2], th[2].saturating_mul(g::KAPPA_LAG_TOP_MUL)];
        let pick = |r: &mut Rng| -> u64 {
            match r.below(10) {
                0..=3 => {
                    let a = anchors[r.below(5) as usize];
                    let dl = r.below(17) as i64 - 8;
                    if dl < 0 { a.saturating_sub((-dl) as u64) } else { a.saturating_add(dl as u64) }
                }
                4..=7 => log_uniform(r, 1, th[2].saturating_mul(8).max(2)),
                8 => r.next(),
                _ => r.below(64),
            }
        };
        let v = pick(&mut r);
        let b = if r.below(4) == 0 { v } else { pick(&mut r) };
        let la = [100u16, 200, 300, 500, 1_000][r.below(5) as usize];
        let lt = [1_000u16, 2_000, 5_000, 10_000, 65_535][r.below(5) as usize];
        let stored = if r.below(2) == 0 { [0u16, 0, 0] } else {
            let mut x = [r.below(lt as u64 + 1) as u16, r.below(lt as u64 + 1) as u16, r.below(lt as u64 + 1) as u16];
            x.sort_unstable();
            x
        };
        let tab = g::tier_leverage(stored, la, lt);
        let pv = g::curve_pos(v, th);
        let qv = g::curve_pos_lag(pv, v, th);
        let (d, vl) = g::smooth_dials_and_venue_l(v, b, th, tab);
        let tier = g::combined_tier(g::depth_tier_for(v, th), g::depth_tier_for(b, th));
        let cells: Vec<String> = (0u8..=4).map(|st| {
            let cap = g::stress_cap_x100(st, tier, tab);
            let t = g::target_ceiling_x100(g::graduation_on(true, 64, tier), st, la, lt, d.l_signal_x100, cap);
            format!("{},{}", cap, t)
        }).collect();
        let cm: u128 = (r.below(2_000_000_000) as u128) * (r.below(1_000_000) as u128 + 1);
        let lam: u32 = [5_000u32, 10_000, 20_000, 50_000, 100_000, 1][r.below(6) as usize];
        let price: u64 = [1u64, 1_000, 150_000_000, 1_000_000, 7_654_321, r.next() >> 20][r.below(6) as usize];
        let cap_depth = if r.below(5) == 0 { None } else { Some(v) };
        let nc = g::n_cap_g8_q_dials(true, cm, lam, d.lambda_depth_bps, d.kappa_bps, cap_depth, price, 1_000_000);
        writeln!(w, "[[{},{},{}],{},{},[{},{},{}],{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}]",
            s(th[0]), s(th[1]), s(th[2]), s(v), s(b), stored[0], stored[1], stored[2], la, lt,
            pv.seg, pv.num, pv.den, qv.seg, qv.num, qv.den,
            s(g::curve_lag_u64(v, th, g::KAPPA_TABLE_BPS)), s(g::curve_lag_u64(v, th, g::LAMBDA_DEPTH_TABLE_BPS)),
            d.l_signal_x100, d.kappa_bps, d.lambda_depth_bps, vl, tier, cells.join(","),
            format!("{},{},{},{},{}", s128(cm), lam, match cap_depth { Some(x) => s(x), None => "null".into() }, s(price), opt128(nc))).unwrap();
    }
}
