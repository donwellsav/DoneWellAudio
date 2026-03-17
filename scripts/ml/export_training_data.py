#!/usr/bin/env python3
"""
Export labeled training data from Supabase for ML model training.

Queries spectral_snapshots for events with user feedback labels
and algorithm scores, outputs a CSV suitable for train_fp_filter.py.

Usage:
  export SUPABASE_URL=https://lybmtcmmqsaqixyvylqx.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=your-key
  python scripts/ml/export_training_data.py [--output data/training.csv]

Output columns:
  msd, phase, spectral, comb, ihr, ptmr, fused_prob, fused_conf,
  is_speech, is_music, is_compressed, user_feedback, label
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("Install supabase-py: pip install supabase")
    sys.exit(1)


CONTENT_TYPES = {"speech", "music", "compressed"}


def export_data(output_path: Path, min_events: int = 10) -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        sys.exit(1)

    client = create_client(url, key)

    # Query labeled events with algorithm scores
    print("Querying labeled events from Supabase...")
    response = (
        client.table("spectral_snapshots")
        .select(
            "algo_msd, algo_phase, algo_spectral, algo_comb, algo_ihr, algo_ptmr, "
            "fused_probability, fused_confidence, event_content_type, user_feedback, "
            "model_version, schema_version"
        )
        .not_.is_("user_feedback", "null")
        .not_.is_("algo_msd", "null")
        .order("created_at", desc=True)
        .limit(10000)
        .execute()
    )

    rows = response.data
    if not rows:
        print("No labeled events found. Need more user feedback (CONFIRM / FALSE+).")
        sys.exit(0)

    print(f"Found {len(rows)} labeled events")

    # Check label balance
    labels = {"confirmed_feedback": 0, "false_positive": 0, "correct": 0}
    for row in rows:
        fb = row.get("user_feedback", "correct")
        labels[fb] = labels.get(fb, 0) + 1

    print(f"Label balance: {labels}")
    if len(rows) < min_events:
        print(f"Warning: Only {len(rows)} events (minimum recommended: {min_events})")

    # Write CSV
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "msd", "phase", "spectral", "comb", "ihr", "ptmr",
        "fused_prob", "fused_conf",
        "is_speech", "is_music", "is_compressed",
        "user_feedback", "label",
    ]

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for row in rows:
            content = row.get("event_content_type", "unknown") or "unknown"
            feedback = row.get("user_feedback", "correct")

            # Binary label: 1 = real feedback, 0 = false positive
            # confirmed_feedback -> 1.0 (user says it's real)
            # false_positive -> 0.0 (user says it's not real)
            # correct -> 0.8 (implicit positive, slightly discounted)
            if feedback == "confirmed_feedback":
                label = 1.0
            elif feedback == "false_positive":
                label = 0.0
            else:
                label = 0.8

            writer.writerow({
                "msd": row.get("algo_msd", 0.5),
                "phase": row.get("algo_phase", 0.5),
                "spectral": row.get("algo_spectral", 0.5),
                "comb": row.get("algo_comb", 0.0),
                "ihr": row.get("algo_ihr", 0.5),
                "ptmr": row.get("algo_ptmr", 0.5),
                "fused_prob": row.get("fused_probability", 0.5),
                "fused_conf": row.get("fused_confidence", 0.5),
                "is_speech": 1 if content == "speech" else 0,
                "is_music": 1 if content == "music" else 0,
                "is_compressed": 1 if content == "compressed" else 0,
                "user_feedback": feedback,
                "label": label,
            })

    print(f"Exported to {output_path}")
    print(f"  Total rows: {len(rows)}")
    print(f"  Confirmed: {labels.get('confirmed_feedback', 0)}")
    print(f"  False positive: {labels.get('false_positive', 0)}")
    print(f"  Correct (implicit): {labels.get('correct', 0)}")


def main():
    parser = argparse.ArgumentParser(description="Export KTR training data from Supabase")
    parser.add_argument(
        "--output", "-o",
        default="data/training.csv",
        help="Output CSV path (default: data/training.csv)",
    )
    parser.add_argument(
        "--min-events",
        type=int,
        default=100,
        help="Minimum events before training is recommended (default: 100)",
    )
    args = parser.parse_args()

    export_data(Path(args.output), min_events=args.min_events)


if __name__ == "__main__":
    main()
