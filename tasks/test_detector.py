"""
Non-interactive test suite for CrabDetector.

Runs on:
  1. All crab_sample_*.jpg images
  2. Augmented versions: rotation, scale, dark lighting, blue underwater tint,
     low contrast, partial crop, glare simulation

Saves annotated output to tasks/test_output/
Prints per-image results and a final summary.
Headless safe (no cv2.imshow).

Usage:
    cd tasks
    python test_detector.py
"""

import cv2
import numpy as np
import os
import sys
import time

TASKS_DIR  = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(TASKS_DIR, 'test_output')
CRABS_DIR  = os.path.join(TASKS_DIR, 'crabs')
os.makedirs(OUTPUT_DIR, exist_ok=True)

sys.path.insert(0, TASKS_DIR)
from crab_detector import CrabDetector


# ---------------------------------------------------------------------------
# Augmentation helpers
# ---------------------------------------------------------------------------

def aug_rotate(img, angle):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw = int(h * sin + w * cos)
    nh = int(h * cos + w * sin)
    M[0, 2] += (nw - w) / 2
    M[1, 2] += (nh - h) / 2
    return cv2.warpAffine(img, M, (nw, nh),
                          borderMode=cv2.BORDER_CONSTANT,
                          borderValue=(200, 200, 200))


def aug_scale(img, factor):
    h, w = img.shape[:2]
    interp = cv2.INTER_AREA if factor < 1 else cv2.INTER_LINEAR
    return cv2.resize(img, (int(w * factor), int(h * factor)), interpolation=interp)


def aug_dark(img, gamma=0.45):
    lut = np.array(
        [min(255, int(255 * (i / 255) ** gamma)) for i in range(256)],
        dtype=np.uint8
    )
    return cv2.LUT(img, lut)


def aug_blue_tint(img, b_boost=1.35, rg_reduce=0.75):
    b, g, r = cv2.split(img.astype(np.float32))
    b = np.clip(b * b_boost,   0, 255)
    g = np.clip(g * rg_reduce, 0, 255)
    r = np.clip(r * rg_reduce, 0, 255)
    return cv2.merge([b, g, r]).astype(np.uint8)


def aug_low_contrast(img, alpha=0.55, beta=80):
    return np.clip(img.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)


def aug_glare(img, n_spots=4):
    out = img.copy()
    h, w = out.shape[:2]
    rng = np.random.default_rng(42)
    for _ in range(n_spots):
        cx = int(rng.integers(0, w))
        cy = int(rng.integers(0, h))
        r  = int(rng.integers(30, 60))
        k  = r * 2 + 1
        mask = np.zeros((h, w), dtype=np.float32)
        cv2.circle(mask, (cx, cy), r, 1.0, -1)
        mask = cv2.GaussianBlur(mask, (k, k), r // 2)
        mask3 = np.stack([mask] * 3, axis=-1)
        white = np.full_like(img, 255, dtype=np.float32)
        out = np.clip(img.astype(np.float32) * (1 - mask3) + white * mask3, 0, 255).astype(np.uint8)
    return out


def aug_partial_crop(img, frac=0.75):
    h, w = img.shape[:2]
    return img[:int(h * frac), :int(w * frac)]


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

def run_test(detector, img, label, save_prefix, use_uw_preprocess=False):
    if use_uw_preprocess:
        img = CrabDetector.preprocess_underwater(img)

    t0 = time.perf_counter()
    detections = detector.detect(img)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    green_count = sum(1 for d in detections if d.is_invasive)
    annotated   = detector.draw(img, detections)

    cv2.putText(annotated, label,
                (10, annotated.shape[0] - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (80, 80, 255), 1, cv2.LINE_AA)

    out_path = os.path.join(OUTPUT_DIR, f"{save_prefix}.jpg")
    cv2.imwrite(out_path, annotated)

    details = [
        f"      [{d.species:<22}] conf={d.confidence:.0%}  bbox={d.bbox}"
        for d in detections
    ]
    return green_count, elapsed_ms, details, len(detections)


def main():
    print("=" * 65)
    print("  CrabDetector -- Full Test Suite")
    print("=" * 65)

    detector = CrabDetector(reference_dir=TASKS_DIR)
    print(f"  Output: {OUTPUT_DIR}\n")

    samples = sorted([
        os.path.join(CRABS_DIR, f)
        for f in os.listdir(CRABS_DIR)
        if f.startswith('crab_sample') and f.endswith('.jpg')
    ])

    if not samples:
        print("[ERROR] No crab_sample_*.jpg found in crabs/")
        sys.exit(1)

    def augmentations(img):
        return [
            ('original',     img,                         False),
            ('rotate_45',    aug_rotate(img, 45),         False),
            ('rotate_90',    aug_rotate(img, 90),         False),
            ('rotate_135',   aug_rotate(img, 135),        False),
            ('rotate_180',   aug_rotate(img, 180),        False),
            ('rotate_270',   aug_rotate(img, 270),        False),
            ('scale_0.6',    aug_scale(img, 0.6),         False),
            ('scale_1.4',    aug_scale(img, 1.4),         False),
            ('dark_0.45',    aug_dark(img, 0.45),         False),
            ('very_dark',    aug_dark(img, 0.25),         False),
            ('blue_tint',    aug_blue_tint(img),          True),
            ('low_contrast', aug_low_contrast(img),       False),
            ('glare',        aug_glare(img),              False),
            ('partial_crop', aug_partial_crop(img, 0.75), False),
        ]

    all_results = {}
    total_tests = 0
    total_ms    = 0.0

    for sample_path in samples:
        sname = os.path.splitext(os.path.basename(sample_path))[0]
        img   = cv2.imread(sample_path)
        if img is None:
            print(f"[SKIP] {sample_path}")
            continue

        print(f"\n{'-'*65}")
        print(f"  {sname}  ({img.shape[1]}x{img.shape[0]})")
        print(f"{'-'*65}")

        sample_res = {}
        for aug_name, aug_img, uw in augmentations(img):
            prefix = f"{sname}__{aug_name}"
            label  = f"{sname} | {aug_name}"
            try:
                count, ms, details, total_dets = run_test(
                    detector, aug_img, label, prefix, uw
                )
                sample_res[aug_name] = {'green': count, 'total': total_dets, 'ms': ms}
                total_tests += 1
                total_ms    += ms
                print(f"  {aug_name:<20}  green={count}  total={total_dets}  {ms:.0f}ms")
                for line in details:
                    print(line)
            except Exception as exc:
                print(f"  {aug_name:<20}  ERROR: {exc}")
                import traceback; traceback.print_exc()

        all_results[sname] = sample_res

    print(f"\n{'='*65}")
    print("  SUMMARY")
    print(f"{'='*65}")
    print(f"  Tests run : {total_tests}")
    avg = total_ms / max(total_tests, 1)
    print(f"  Avg time  : {avg:.1f} ms/frame  (~{1000/avg:.0f} FPS)")
    print()
    print(f"  {'Sample':<22} {'Scenario':<20} {'Green':>6} {'Total':>6}")
    print(f"  {'-'*22} {'-'*20} {'-'*6} {'-'*6}")
    for sname, scenarios in all_results.items():
        for aug_name, res in scenarios.items():
            print(f"  {sname:<22} {aug_name:<20} {res['green']:>6} {res['total']:>6}")
    print(f"\n  Annotated images -> {OUTPUT_DIR}")
    print("=" * 65)


if __name__ == '__main__':
    main()
