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
    for _ in 0..250 { v.push(log_uniform(r, 1, top)); }
    for _ in 0..40 { v.push(r.next()); }
    v.sort_unstable();
    v.dedup();
    v
}

fn main() {
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
    out.push_str(&format!("\"meta\":{{\"source\":\"percolator-prog growth_v19 (curve_pos / curve_value / log2_q16 / smooth_dials_and_venue_l / smooth_dials_venue_l_and_pos / stress_cap_curve_x100 / venue_depth_capped / n_cap_g8_q_dials / growth_matcher_caps_g8_dials)\",\"wrapper_commit\":\"{}\",\"generator\":\"wt-v22-contlev-port/curve-fixtures\"}},\n", commit));
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
            format!("[{},{},{},{},{}]", s(*d), p.seg, p.num, p.den, vals.join(","))
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
    let ltabs: Vec<[u16; 4]> = vec![
        g::tier_leverage([0, 0, 0], 500, 2_000),
        g::tier_leverage([0, 0, 0], 200, 2_000),
        g::tier_leverage([750, 1_500, 5_000], 300, 5_000),
        g::tier_leverage([0, 0, 0], 500, 1_000),
        g::tier_leverage([2_000, 4_000, 10_000], 1_000, 10_000),
    ];
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
    // continuous stress cap (3198539a): stress_cap_curve_x100 at the curve position of each depth, every stress level, every L table;
    // plus the signal / venue positions smooth_dials_venue_l_and_pos hands it
    out.push_str("],\n\"stress_cap\":[");
    let mut rows = Vec::new();
    for (ci, (_, th)) in configs.iter().enumerate() {
        let ds = depths_for(*th, &mut r);
        for li in 0..ltabs.len() {
            for _ in 0..40 {
                let d = ds[r.below(ds.len() as u64) as usize];
                let p = g::curve_pos(d, *th);
                let caps: Vec<String> = (0u8..=4).map(|st| g::stress_cap_curve_x100(st, p, ltabs[li]).to_string()).collect();
                rows.push(format!("[{},{},{},{}]", ci, li, s(d), caps.join(",")));
            }
        }
        // every anchor +-1 with the default table: the cap is continuous there
        for &a in g::curve_anchors(*th).iter() {
            for d in [a.saturating_sub(1), a, a.saturating_add(1)] {
                let p = g::curve_pos(d, *th);
                let caps: Vec<String> = (0u8..=4).map(|st| g::stress_cap_curve_x100(st, p, ltabs[0]).to_string()).collect();
                rows.push(format!("[{},{},{},{}]", ci, 0, s(d), caps.join(",")));
            }
        }
    }
    let fp: Vec<String> = (0u8..=4).map(|st| g::stress_cap_curve_x100(st, g::CURVE_POS_FAIL, ltabs[0]).to_string()).collect();
    rows.push(format!("[-1,0,\"fail\",{}]", fp.join(",")));
    out.push_str(&rows.join(","));
    out.push_str("],\n\"dial_pos\":[");
    let mut rows = Vec::new();
    for (ci, (_, th)) in configs.iter().enumerate() {
        let ds = depths_for(*th, &mut r);
        for _ in 0..60 {
            let v = ds[r.below(ds.len() as u64) as usize];
            let b = ds[r.below(ds.len() as u64) as usize];
            let (d, vl, ps, pv) = g::smooth_dials_venue_l_and_pos(v, b, *th, ltabs[0]);
            rows.push(format!("[{},{},{},{},{},{},{},{},{},{},{},{},{}]", ci, s(v), s(b), d.l_signal_x100, d.kappa_bps, d.lambda_depth_bps, vl, ps.seg, ps.num, ps.den, pv.seg, pv.num, pv.den));
        }
    }
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
    eprintln!("log2 {} curve-rows {} dials {} ", lx.len(), total, ndials);
}
