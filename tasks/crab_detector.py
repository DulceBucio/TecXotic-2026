"""
Invasive European Green Crab Detector
======================================
Detects and counts invasive European Green Crabs on the competition board,
distinguishing them from native Rock crabs and Jonah's crabs.

Visual signatures exploited:
  European Green Crab  -- Very dark/black body; subtle olive-green hue; wide
                          thick claws; spiky carapace edge; white patches right
                          at the spike tips (bimodal brightness distribution)
  Rock Crab (native)   -- Uniform warm orange-brown; smooth rounded carapace;
                          no spikes; proportional claws
  Jonah's Crab (native)-- Orange-brown body (lighter); BLACK claw tips on
                          otherwise warm body; long thin legs; smooth carapace

Pipeline:
  1. HSV blob detection  -- dark_not_blue mask finds all crabs regardless of
                            species, angle, or scale; background excluded by
                            blue-hue filter
  2. Feature extraction  -- darkness ratio, warm-hue ratio, olive-hue ratio,
                            bimodal V (dark body + white spike patches), black-
                            on-warm (Jonah tip signature), edge density
                            (spikiness proxy for green crab)
  3. Rule-based classify -- multi-feature score per species
  4. ORB confirmation    -- optional keypoint vote on large blobs
  5. IoU deduplication   -- NMS keeps highest-confidence detection per region

Competition robustness:
  - Blue-hue exclusion  removes dark pool background; no board-isolation needed
  - CLAHE on grayscale  used only for ORB, not for primary blob detection
  - White-pixel masking removes lamination glare from color stats
  - Morphological close bridges leg gaps; open removes corrugation noise
  - Aspect-ratio filter discards tether shadows and long board edges
  - preprocess_underwater() corrects blue/green tint before detect()
"""

import cv2
import numpy as np
import os
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Detection:
    bbox: Tuple[int, int, int, int]    # (x, y, w, h) frame pixels
    species: str
    confidence: float                   # 0.0 - 1.0
    is_invasive: bool
    method: str                         # 'color' | 'hybrid'
    features: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class CrabDetector:

    # ---- Blob detection (HSV segmentation) ---------------------------------
    DARK_V_THRESH   = 110   # V < this counts as dark pixel (on CLAHE-equalised V)
    VERY_DARK_V     = 75    # V < this is so dark that hue is unreliable; always include
    BLUE_H_MIN      = 85    # blue background hue range (OpenCV: 0-180)
    BLUE_H_MAX      = 135
    BLUE_S_MIN      = 150   # only exclude genuinely saturated blue (not tinted dark crabs)
    MORPH_OPEN_K    = 3     # noise removal kernel
    MORPH_CLOSE_K   = 18    # gap-filling kernel (bridges crab leg gaps)
    MIN_BLOB_AREA   = 650   # px^2 minimum contour area (catches small-print crabs)
    MAX_BLOB_AREA   = 95_000
    MIN_BLOB_DIM    = 35    # minimum width AND height in px (filters fragments)
    EDGE_MARGIN     = 3     # px from frame edge to trigger edge check
    EDGE_THIN_MAX   = 68    # max thin-dimension for edge blobs to be rejected
    MIN_ASPECT      = 0.22  # w/h (crabs with spread legs can be wide)
    MAX_ASPECT      = 4.0
    REGION_PAD      = 12    # px of context padding around each blob

    # ---- Classification features -------------------------------------------
    WHITE_V_THRESH  = 215   # V above this = white background / lamination glare

    # European Green Crab: NEAR-BLACK body, not brown.
    # The decisive feature: dark pixels are achromatic (low saturation).
    # Brown crabs are dark but coloured — their dark pixels have higher saturation.
    DARK_V_PIXEL    = 100   # pixel is "dark" if V < this (for saturation analysis)
    DARK_S_MAX      = 35    # max mean saturation of dark pixels for green crab
                            # (achromatic black < 35; coloured dark-brown > 50)
    GREEN_DARK_MIN  = 0.20  # min dark-pixel fraction (loose — catches small crabs)
    GREEN_MEAN_V    = 150   # max mean-V of non-white pixels (generous — sticker bg)
    GREEN_WARM_MAX  = 0.05  # max warm hue fraction — green crabs have almost none

    # Adaptive saturation scaling
    # DARK_S_MAX is scaled by (frame_avg_S / REFERENCE_S) each frame.
    # When the frame S is compressed (low contrast) or elevated (tint), the
    # threshold scales proportionally so the green/native ratio is preserved.
    REFERENCE_FRAME_S = 22.0  # typical mean S of a balanced competition frame

    # Bimodal V: green crab has dark body + white patches near spikes
    BIMODAL_DARK_F  = 0.18  # fraction of non-white pixels that are dark
    BIMODAL_LIGHT_F = 0.05  # fraction of non-white pixels that are bright

    # Native crabs: warm orange/brown hue
    WARM_H_MIN      = 7
    WARM_H_MAX      = 28
    WARM_S_MIN      = 55
    WARM_V_MIN      = 45
    WARM_V_MAX      = 215

    # Jonah's crab: dark tips on warm body
    JONAH_TIP_DARK  = 0.07
    JONAH_WARM_MIN  = 0.20

    # Confidence minimum -- detections below this are discarded
    MIN_CONFIDENCE  = 0.30

    # ---- ORB confirmation ---------------------------------------------------
    MIN_ORB_AREA    = 45_000  # only run ORB on very large blobs; color is primary classifier
    ORB_MIN_MATCHES = 7
    ORB_RATIO       = 0.75
    ORB_WEIGHT      = 0.28  # how much ORB shifts the final confidence

    # ---- Deduplication ------------------------------------------------------
    IOU_THRESH      = 0.38

    # ---- Display ------------------------------------------------------------
    COLORS_BGR = {
        'european_green_crab': (0,   220,   0),
        'native_rock_crab':    (0,   150, 255),
        'native_jonah_crab':   (255, 110,   0),
        'native_crab':         (0,   150, 255),
    }
    LABELS = {
        'european_green_crab': 'Green Crab (INVASIVE)',
        'native_rock_crab':    'Rock Crab',
        'native_jonah_crab':   "Jonah's Crab",
        'native_crab':         'Native Crab',
    }

    # -------------------------------------------------------------------------

    def __init__(self):
        base = os.path.dirname("tasks/crabs")

        # ORB + FLANN (LSH for binary descriptors)
        self.orb   = cv2.ORB_create(nfeatures=1000)
        idx_p      = dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)
        self.flann = cv2.FlannBasedMatcher(idx_p, dict(checks=50))
        self.clahe         = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        # Larger tiles: enhances global contrast without amplifying corrugation
        self.clahe_enhance = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))

        # Reference database
        species_paths = {
            'european_green_crab': 'crabs/european_green_crab.jpg',
            'native_rock_crab':    'crabs/native_rock_crab.jpg',
            'native_jonah_crab':   'crabs/native_jonah_crab.jpg',
        }
        self.refs = {}
        for name, rel in species_paths.items():
            path = os.path.join(base, rel)
            img  = cv2.imread(path)
            if img is None:
                raise FileNotFoundError(f"Reference not found: {path}")
            gray    = self.clahe.apply(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
            kp, des = self.orb.detectAndCompute(gray, None)
            self.refs[name] = {
                'img': img, 'kp': kp, 'des': des,
                'invasive': name == 'european_green_crab',
            }

        print(f"[CrabDetector] Ready -- {len(self.refs)} species loaded.")

    # =========================================================================
    # 1. Blob detection
    # =========================================================================

    # =========================================================================
    # Frame enhancement (optional, applied before full pipeline)
    # =========================================================================

    def _enhance_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Normalise the frame for robust detection under adverse lighting:
          - Dim/dark ROV lighting   (gamma-darkened, weak lights)
          - Underwater blue/green tint
          - Low contrast / overexposure

        Two steps — both preserve pixel SATURATION so dark_pixel_sat
        (the primary species classifier) is unaffected:

        Step 1 — Gray-world white balance:
          Scales each channel so their means are equal.
          Removes colour cast (blue tint, green tint, etc.).
          Near-zero effect when frame is already colour-balanced.

        Step 2 — CLAHE on blur-smoothed V channel:
          GaussianBlur (25x25) removes the corrugated board texture
          before CLAHE so fine ridges are not amplified.
          Restores dark/light contrast in dim or flat-contrast frames.
          CLAHE does NOT change S, so dark_pixel_sat is unchanged.
        """
        # -- Step 1: Gray-world white balance ---------------------------------
        b_f, g_f, r_f = cv2.split(frame.astype(np.float32))
        b_m, g_m, r_m = b_f.mean(), g_f.mean(), r_f.mean()
        if min(b_m, g_m, r_m) > 1.0:
            gray = (b_m + g_m + r_m) / 3.0
            b_f  = np.clip(b_f * (gray / b_m), 0, 255)
            g_f  = np.clip(g_f * (gray / g_m), 0, 255)
            r_f  = np.clip(r_f * (gray / r_m), 0, 255)
        balanced = cv2.merge([b_f, g_f, r_f]).astype(np.uint8)

        # -- Step 2: CLAHE on blur-smoothed V ---------------------------------
        hsv     = cv2.cvtColor(balanced, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)

        # Detect synthetic neutral-gray padding from image rotation.
        # Criteria: near-achromatic (S < 15) + mid-brightness (V 130-225).
        # This is distinct from the real pool background (dark, high-S blue)
        # and from the white board (S < 15 but V > 225).
        # Without this mask, 50% of a 45-degree rotated image is gray padding
        # which completely distorts the CLAHE histogram.
        is_padding = (s < 15) & (v > 130) & (v < 225)

        # 11px kernel: suppresses corrugation (period ~10px) without smearing
        # the crab signal into the bright board (which a 25px kernel does)
        v_blur  = cv2.GaussianBlur(v, (11, 11), 0)

        # For CLAHE: replace padding with board-level brightness so the
        # histogram reflects only real image content (board + crabs).
        v_clahe_input = v_blur.copy()
        non_pad = ~is_padding
        board_level = int(np.percentile(v_blur[non_pad], 90)) if non_pad.any() else 230
        v_clahe_input[is_padding] = min(board_level, 240)

        v_enh = self.clahe_enhance.apply(v_clahe_input)

        # Restore padding pixels to their original V (don't alter the background)
        v_enh[is_padding] = v[is_padding]

        enhanced = cv2.cvtColor(cv2.merge([h, s, v_enh]), cv2.COLOR_HSV2BGR)

        return enhanced

    def _build_primary_mask(self, frame: np.ndarray) -> np.ndarray:
        """
        Binary mask of all dark pixels that are NOT blue background.

        Key insight from diagnostic:
          Raw V < 110 captures ALL crab species cleanly. Excluding blue hue
          removes the pool/fabric background without needing board isolation.

        NOTE: CLAHE is intentionally NOT applied here. The corrugated board
        texture causes CLAHE to amplify fine ridges into thousands of false
        dark blobs, breaking detection speed and accuracy. V is used raw.

        Lighting robustness:
          very_dark (V < VERY_DARK_V) bypasses the blue-hue filter because
          hue is numerically unreliable at near-black brightness. This also
          recovers detections when underwater blue tint shifts dark crab hues
          into the blue range at low saturation.
          BLUE_S_MIN=120 (vs a tighter 80) ensures only genuinely saturated
          blue background pixels are excluded, not blue-tinted dark crabs.
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)

        # Blue background: must be saturated blue (pool / fabric), not dark tinted crabs
        is_blue   = (h >= self.BLUE_H_MIN) & (h <= self.BLUE_H_MAX) & (s > self.BLUE_S_MIN)

        # Near-black: include unconditionally (hue unreliable, handles blue tint)
        very_dark = v < self.VERY_DARK_V

        # Standard dark-not-blue path
        dark_crab = (v < self.DARK_V_THRESH) & ~is_blue

        dark_crab = very_dark | dark_crab

        mask = dark_crab.astype(np.uint8) * 255

        # Open: remove corrugation texture and dust
        k_o = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                        (self.MORPH_OPEN_K, self.MORPH_OPEN_K))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k_o)

        # Close: bridge gaps between crab legs and body parts
        k_c = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                        (self.MORPH_CLOSE_K, self.MORPH_CLOSE_K))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_c)

        return mask

    def _find_blobs(self, frame: np.ndarray):
        """Return list of (x, y, w, h, contour) for valid crab candidates."""
        mask = self._build_primary_mask(frame)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        blobs = []
        fh, fw = frame.shape[:2]
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (self.MIN_BLOB_AREA <= area <= self.MAX_BLOB_AREA):
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            if not (self.MIN_ASPECT <= w / max(h, 1) <= self.MAX_ASPECT):
                continue
            if w < self.MIN_BLOB_DIM or h < self.MIN_BLOB_DIM:
                continue
            # Fill ratio: contour area vs bounding box area.
            # Real crabs are dense blobs (>12% fill). Board-edge rectangles
            # are thin outlines (<5% fill) and get rejected here.
            if area / max(w * h, 1) < 0.12:
                continue
            # Reject thin blobs touching a single frame edge (board edge artefacts).
            if x <= self.EDGE_MARGIN and w < self.EDGE_THIN_MAX:
                continue
            if y <= self.EDGE_MARGIN and h < self.EDGE_THIN_MAX:
                continue
            if x + w >= fw - self.EDGE_MARGIN and w < self.EDGE_THIN_MAX:
                continue
            if y + h >= fh - self.EDGE_MARGIN and h < self.EDGE_THIN_MAX:
                continue
            # Reject blobs that simultaneously touch TWO edges (image corners).
            # These are artefacts from board corners being included via very_dark.
            # Real crabs are never exactly in the corner of the frame.
            on_left   = x <= self.EDGE_MARGIN
            on_right  = x + w >= fw - self.EDGE_MARGIN
            on_top    = y <= self.EDGE_MARGIN
            on_bottom = y + h >= fh - self.EDGE_MARGIN
            if (on_left or on_right) and (on_top or on_bottom):
                continue
            blobs.append((x, y, w, h, cnt))
        return blobs

    # =========================================================================
    # 2. Feature extraction
    # =========================================================================

    def _extract_features(self, region: np.ndarray) -> dict:
        """
        Extract multi-feature vector from a detected blob region (full color,
        padded bounding box from the original frame).

        Features used for classification:
          dark_ratio    fraction of non-white pixels with V < GREEN_DARK_V
          mean_v        mean brightness of non-white pixels
          warm_ratio    fraction with warm orange/brown hue
          olive_ratio   fraction of dark pixels with olive/green hue
          bimodal       bool: dark body + white patches -> green crab signature
          black_on_warm bool: dark tips on warm body    -> Jonah's crab signature
          edge_density  Canny edges / area  (spikiness proxy, green crab higher)
        """
        if region is None or region.size == 0:
            return {}

        hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        h_ch, s_ch, v_ch = cv2.split(hsv)

        # Exclude lamination glare and printed white backgrounds
        non_white  = v_ch < self.WHITE_V_THRESH
        n          = int(non_white.sum())
        if n < 20:
            return {}

        v_nw = v_ch[non_white]
        h_nw = h_ch[non_white]
        s_nw = s_ch[non_white]

        # -- Darkness -----------------------------------------------------------
        dark_mask  = v_nw < self.DARK_V_PIXEL
        dark_ratio = float(dark_mask.sum()) / n
        mean_v     = float(v_nw.mean())

        # -- Saturation of dark pixels — THE key discriminator ---------------
        # European Green Crabs are near-achromatic black: dark_pixel_sat < 35
        # Dark-brown native crabs are coloured even when dark: dark_pixel_sat > 50
        s_dark         = s_nw[dark_mask]
        dark_pixel_sat = float(s_dark.mean()) if len(s_dark) > 0 else 100.0

        # -- Warm hue (native crab signal) ------------------------------------
        warm_mask  = ((h_nw >= self.WARM_H_MIN) & (h_nw <= self.WARM_H_MAX)
                      & (s_nw > self.WARM_S_MIN)
                      & (v_nw > self.WARM_V_MIN) & (v_nw < self.WARM_V_MAX))
        warm_ratio = float(warm_mask.sum()) / n

        # -- Bimodal V: dark body + white patches near spikes ----------------
        light_near_white = float((v_nw > (self.WHITE_V_THRESH - 35)).sum()) / n
        bimodal = (dark_ratio >= self.BIMODAL_DARK_F
                   and light_near_white >= self.BIMODAL_LIGHT_F)

        # -- Black-on-warm: Jonah's crab tip signature -----------------------
        black_on_warm = (warm_ratio >= self.JONAH_WARM_MIN
                         and dark_ratio >= self.JONAH_TIP_DARK)

        return {
            'dark_ratio':     dark_ratio,
            'dark_pixel_sat': dark_pixel_sat,
            'mean_v':         mean_v,
            'warm_ratio':     warm_ratio,
            'bimodal':        bimodal,
            'black_on_warm':  black_on_warm,
            'n_pixels':       n,
        }

    # =========================================================================
    # 3. Classification
    # =========================================================================

    def _classify(self, feats: dict) -> Tuple[str, float]:
        """
        Species classifier based on dark-pixel saturation as the primary signal.

        Key insight: European Green Crabs appear near-achromatic BLACK in print.
        Dark-brown native crabs are COLOURED even in their dark areas.
        Measuring mean saturation of dark pixels (V < 100) cleanly separates them:
          green crab  -> dark_pixel_sat < 35  (desaturated, achromatic)
          native crab -> dark_pixel_sat > 50  (retains warm colour in dark areas)
        """
        if not feats:
            return 'native_crab', 0.25

        dark_ratio     = feats.get('dark_ratio', 0.0)
        dark_pixel_sat = feats.get('dark_pixel_sat', 100.0)
        mean_v         = feats.get('mean_v', 200.0)
        warm_ratio     = feats.get('warm_ratio', 0.0)
        bimodal        = feats.get('bimodal', False)
        b_on_warm      = feats.get('black_on_warm', False)

        # Adaptive DARK_S_MAX: scales with average frame saturation so the
        # achromatic-vs-coloured ratio is preserved under low contrast or tint.
        # Normal frame: scale=1.0, threshold=35 — identical to baseline.
        # Low contrast (compressed S): scale<1, threshold shrinks proportionally.
        frame_avg_s    = feats.get('_frame_avg_s', self.REFERENCE_FRAME_S)
        s_scale        = max(0.25, min(2.0, frame_avg_s / self.REFERENCE_FRAME_S))
        eff_dark_s_max = self.DARK_S_MAX * s_scale

        # ---- European Green Crab -------------------------------------------
        # dark_pixel_sat is the decisive feature: near-black = near-achromatic.
        if (dark_pixel_sat < eff_dark_s_max        # achromatic black, not brown
                and dark_ratio >= self.GREEN_DARK_MIN   # has enough dark pixels
                and warm_ratio < self.GREEN_WARM_MAX    # no warm hue present
                and mean_v < self.GREEN_MEAN_V):        # not overall too bright

            achromatic = max(0.0, (eff_dark_s_max - dark_pixel_sat)
                             / eff_dark_s_max)            # 0-1, higher = blacker
            darkness   = min(dark_ratio / 0.70, 1.0)
            score      = achromatic * 0.50 + darkness * 0.40
            score     += 0.10 if bimodal else 0.0
            return 'european_green_crab', max(self.MIN_CONFIDENCE, min(score, 1.0))

        # ---- Native crabs (warm orange/brown body) -------------------------
        if warm_ratio >= 0.08:
            base = min(warm_ratio / 0.55, 1.0) * 0.65
            if b_on_warm:
                return 'native_jonah_crab', min(base + 0.20, 1.0)
            return 'native_rock_crab', min(base + 0.12, 1.0)

        # ---- Fallback ------------------------------------------------------
        return 'native_crab', 0.28

    # =========================================================================
    # 4. ORB confirmation (large blobs only)
    # =========================================================================

    def _orb_vote(self, region: np.ndarray) -> Tuple[Optional[str], float]:
        """
        Attempt ORB keypoint matching against reference images.
        Returns (best_species, normalised_score) or (None, 0).
        """
        if region is None or (region.shape[0] * region.shape[1]) < self.MIN_ORB_AREA:
            return None, 0.0

        gray = self.clahe.apply(cv2.cvtColor(region, cv2.COLOR_BGR2GRAY))
        kp, des = self.orb.detectAndCompute(gray, None)
        if des is None or len(kp) < 5:
            return None, 0.0

        best, best_score = None, 0.0
        for name, ref in self.refs.items():
            if ref['des'] is None:
                continue
            try:
                raw = self.flann.knnMatch(ref['des'], des, k=2)
            except cv2.error:
                continue
            good = [m for mn in raw if len(mn) == 2
                    for m, n in [mn]
                    if m.distance < self.ORB_RATIO * n.distance]
            if len(good) < self.ORB_MIN_MATCHES:
                continue
            score = len(good) / max(len(ref['des']), 1)
            if score > best_score:
                best_score, best = score, name

        return best, float(best_score)

    # =========================================================================
    # 5. Deduplication
    # =========================================================================

    @staticmethod
    def _iou(a, b) -> float:
        ax1, ay1, aw, ah = a
        bx1, by1, bw, bh = b
        ix1 = max(ax1, bx1);  iy1 = max(ay1, by1)
        ix2 = min(ax1+aw, bx1+bw);  iy2 = min(ay1+ah, by1+bh)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2-ix1) * (iy2-iy1)
        union = aw*ah + bw*bh - inter
        return inter / union if union > 0 else 0.0

    def _deduplicate(self, dets: List[Detection]) -> List[Detection]:
        dets = sorted(dets, key=lambda d: d.confidence, reverse=True)
        kept: List[Detection] = []
        for det in dets:
            if all(self._iou(det.bbox, k.bbox) < self.IOU_THRESH for k in kept):
                kept.append(det)
        return kept

    # =========================================================================
    # Main API
    # =========================================================================

    def detect(self, frame: np.ndarray, enhance: bool = False) -> List[Detection]:
        """
        Run full pipeline on a BGR frame.
        Returns deduplicated list of Detection objects.

        Args:
            frame:   BGR image from camera.
            enhance: If True, apply gray-world white balance + CLAHE contrast
                     enhancement before detection. Helps with mild underwater
                     blue tint and compressed contrast. Has no effect in normal
                     competition lighting and can cause regressions on images
                     with large neutral-gray borders (synthetic rotation tests).
                     Default False — normal competition mode.
                     Enable explicitly if operating in very dim or heavily
                     colour-cast conditions.
        """
        # Enhanced frame: used for BOTH blob detection and feature extraction.
        # _enhance_frame applies (1) gray-world white balance to correct colour cast
        # and (2) CLAHE on blur-smoothed V to restore contrast in dim frames.
        # CLAHE only modifies V, never S — so dark_pixel_sat (the core classifier)
        # remains valid on the enhanced frame.
        #
        # Adaptive DARK_S_MAX: computed once per frame from frame_avg_s so the
        # achromatic/warm ratio is preserved even under low contrast or tint.
        if enhance:
            proc = self._enhance_frame(frame)
            _hsv_full = cv2.cvtColor(proc, cv2.COLOR_BGR2HSV)
            frame_avg_s = float(np.mean(cv2.split(_hsv_full)[1]))
        else:
            proc = frame
            frame_avg_s = self.REFERENCE_FRAME_S

        blobs = self._find_blobs(proc)
        fh, fw = proc.shape[:2]
        detections: List[Detection] = []

        for (x, y, w, h, cnt) in blobs:
            p   = self.REGION_PAD
            rx  = max(0, x - p);  ry = max(0, y - p)
            rw  = min(w + 2*p, fw - rx)
            rh  = min(h + 2*p, fh - ry)
            region = proc[ry:ry+rh, rx:rx+rw]

            feats = self._extract_features(region)
            if not feats:
                continue

            feats['_frame_avg_s'] = frame_avg_s   # pass for adaptive threshold

            species, conf = self._classify(feats)
            method = 'color'

            # Optional ORB vote on large blobs
            if (w * h) >= self.MIN_ORB_AREA:
                orb_species, orb_score = self._orb_vote(region)
                if orb_species is not None:
                    method = 'hybrid'
                    if orb_species == species:
                        conf = conf * (1 - self.ORB_WEIGHT) + orb_score * self.ORB_WEIGHT
                    else:
                        conf *= 0.82   # slight penalty for disagreement

            if conf < self.MIN_CONFIDENCE:
                continue

            detections.append(Detection(
                bbox=(x, y, w, h),
                species=species,
                confidence=round(min(conf, 1.0), 2),
                is_invasive=(species == 'european_green_crab'),
                method=method,
                features=feats,
            ))

        return self._deduplicate(detections)

    # =========================================================================
    # Preprocessing
    # =========================================================================

    @staticmethod
    def preprocess_underwater(frame: np.ndarray) -> np.ndarray:
        """
        Compensate for the blue/green tint from pool water and ROV lights.
        Call before detect() when operating underwater.
        """
        f = frame.astype(np.float32)
        b, g, r = cv2.split(f)
        b = np.clip(b * 0.78, 0, 255)
        g = np.clip(g * 0.88, 0, 255)
        r = np.clip(r * 1.12, 0, 255)
        out = cv2.merge([b, g, r]).astype(np.uint8)
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b_ = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b_]), cv2.COLOR_LAB2BGR)

    # =========================================================================
    # Visualization
    # =========================================================================

    def draw(self, frame: np.ndarray, detections: List[Detection]) -> np.ndarray:
        """Draw bounding boxes, labels, and invasive count badge onto frame."""
        out         = frame.copy()
        green_count = sum(1 for d in detections if d.is_invasive)

        for det in detections:
            x, y, w, h = det.bbox
            color = self.COLORS_BGR.get(det.species, (180, 180, 180))
            label = f"{self.LABELS.get(det.species, det.species)}  {det.confidence:.0%}"

            thick = 3 if det.is_invasive else 2
            cv2.rectangle(out, (x, y), (x+w, y+h), color, thick)

            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 1)
            cv2.rectangle(out, (x, y - th - 10), (x + tw + 6, y), color, -1)
            cv2.putText(out, label, (x+3, y-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1, cv2.LINE_AA)

        badge = f"Invasive Green Crabs: {green_count}"
        (bw, bh), _ = cv2.getTextSize(badge, cv2.FONT_HERSHEY_SIMPLEX, 0.85, 2)
        cv2.rectangle(out, (8, 8), (20 + bw, 22 + bh), (10, 10, 10), -1)
        cv2.putText(out, badge, (14, 14 + bh),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 230, 80), 2, cv2.LINE_AA)

        return out
