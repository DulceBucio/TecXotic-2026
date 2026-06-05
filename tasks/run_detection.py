"""
Run crab detection on sample images or live camera feed.

Usage:
    python run_detection.py                  # run on all crab_sample_*.jpg
    python run_detection.py --camera         # live camera (index 0)
    python run_detection.py --camera 1       # live camera (index 1)
    python run_detection.py path/to/img.jpg  # specific image(s)
"""

import cv2
import os
import sys

from crab_detector import CrabDetector


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def run_on_images(paths: list[str], detector: CrabDetector) -> None:
    for path in paths:
        frame = cv2.imread(path)
        if frame is None:
            print(f"[SKIP] Could not load: {path}")
            continue

        detections  = detector.detect(frame)
        result      = detector.draw(frame, detections)
        green_count = sum(1 for d in detections if d.is_invasive)

        print(f"\n{'─'*50}")
        print(f"Image : {os.path.basename(path)}")
        print(f"Invasive Green Crabs detected: {green_count}")
        for d in detections:
            print(f"  [{d.species}]  confidence={d.confidence:.0%}  bbox={d.bbox}")

        cv2.imshow(f"{os.path.basename(path)}", result)
        key = cv2.waitKey(0)
        if key == ord('q'):
            break

    cv2.destroyAllWindows()


def run_on_camera(camera_index: int, detector: CrabDetector) -> None:
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"[ERROR] Could not open camera index {camera_index}")
        return

    print(f"Live detection on camera {camera_index} — press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Frame read failed.")
            break

        detections = detector.detect(frame)
        result     = detector.draw(frame, detections)

        cv2.imshow("Crab Detection — Live", result)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    detector = CrabDetector(reference_dir=BASE_DIR)

    args = sys.argv[1:]

    if args and args[0] == "--camera":
        index = int(args[1]) if len(args) > 1 else 0
        run_on_camera(index, detector)

    elif args:
        # Treat remaining args as image paths
        run_on_images(args, detector)

    else:
        # Default: all sample images in crabs/
        samples = sorted([
            os.path.join(BASE_DIR, "crabs", f)
            for f in os.listdir(os.path.join(BASE_DIR, "crabs"))
            if f.startswith("crab_sample") and f.endswith(".jpg")
        ])
        if not samples:
            print("[ERROR] No crab_sample_*.jpg found in crabs/")
        else:
            print(f"Running on {len(samples)} sample image(s)...")
            run_on_images(samples, detector)
