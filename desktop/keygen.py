#!/usr/bin/env python3
"""
VGAP License Key Generator — developer-only CLI tool.

Usage:
  python keygen.py                    # 1 Standard key, 365 days
  python keygen.py --days 90          # 90-day trial
  python keygen.py --edition 1 -n 5   # 5 Pro keys, 365 days
  python keygen.py --machine-id       # show this machine's ID
"""
import argparse, sys
sys.path.insert(0, __file__.replace("keygen.py", ""))
from services.license import generate_key, machine_id, verify_key, EDITIONS

def main():
    ap = argparse.ArgumentParser(description="VGAP License Key Generator")
    ap.add_argument("--days",       type=int, default=365,  help="days until expiry (default 365)")
    ap.add_argument("--edition",    type=int, default=0,    help="0=Standard, 1=Pro (default 0)")
    ap.add_argument("-n", "--count",type=int, default=1,    help="number of keys to generate")
    ap.add_argument("--machine-id", action="store_true",    help="print this machine's ID and exit")
    args = ap.parse_args()

    if args.machine_id:
        print(f"Machine ID: {machine_id()}")
        return

    edition_name = EDITIONS.get(args.edition, f"edition-{args.edition}")
    print(f"Generating {args.count} × {edition_name} key(s) — valid {args.days} days\n")
    for _ in range(args.count):
        key = generate_key(days=args.days, edition=args.edition)
        info = verify_key(key)
        print(f"  {key}  |  expires in {info['expiry_days']} days  [{info['edition']}]")

if __name__ == "__main__":
    main()
