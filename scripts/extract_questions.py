"""
extract_questions.py

Parses College Board Question Bank PDF exports (the "print as PDF" style
export with one question per page, a metadata table, and a Rationale
section) into structured question data + cropped question/answer images.

Usage:
    python3 extract_questions.py

Edit PDF_SOURCES at the bottom to point at your input PDFs, and
WORK_DIR for where you want the output written.

Requires: pdfplumber, Pillow, and poppler-utils (pdftoppm) on PATH.
    pip install pdfplumber pillow --break-system-packages
    apt-get install poppler-utils   # provides pdftoppm

How it works
------------
Each question in these PDF exports follows a consistent layout:
  1. A "Question ID <hex>" header, a metadata table (Assessment / Test /
     Domain / Skill / Difficulty), and a navy "ID: <hex>" bar.
  2. The question stem, (optional) graph/figure, and answer choices
     A-D (or, for student-produced-response questions, no choices).
  3. A navy "ID: <hex> Answer" bar, "Correct Answer: ...", "Rationale",
     the explanation text, and "Question Difficulty: ...".

Because many equations and all graphs are embedded as images (not
selectable text) in the source PDF, plain text extraction loses that
content. This script instead:
  - Uses pdfplumber word bounding boxes to find the structural markers
    above (question start, the front/back boundary, choice letters,
    metadata table) with page/pixel coordinates.
  - Rasterizes each page with pdftoppm and crops out two clean images
    per question: the question ("front") and the answer + rationale
    ("back") -- with the redundant navy header/footer bars trimmed out.
  - Also outputs pixel-coordinate hit-boxes for each A/B/C/D choice
    marker, so a front-end can overlay clickable regions on the
    question image without needing to re-typeset the choices as text.
"""

import pdfplumber, re, os, json, subprocess, unicodedata
from PIL import Image

DPI = 130
SCALE = DPI / 72.0
PAGE_H_PT = 792
PAGE_H_PX = int(PAGE_H_PT * SCALE)
MARGIN_PX = 14

WORK_DIR = r"C:\Users\kevin\Downloads\sat\scripts"
OUT_IMG = os.path.join(WORK_DIR, "images")
OUT_JSON = os.path.join(WORK_DIR, "questions.json")
os.makedirs(OUT_IMG, exist_ok=True)

_render_cache = {}


def render_page(pdf_path, page_num_1indexed, tag):
    """Rasterize a single PDF page to a PIL Image, cached per (tag, page)."""
    key = (tag, page_num_1indexed)
    if key in _render_cache:
        return _render_cache[key]
    out_prefix = os.path.join(WORK_DIR, f"render_{tag}_{page_num_1indexed}")
    subprocess.run(
        [
            "pdftoppm",
            "-png",
            "-r",
            str(DPI),
            "-f",
            str(page_num_1indexed),
            "-l",
            str(page_num_1indexed),
            pdf_path,
            out_prefix,
        ],
        check=True,
        capture_output=True,
    )
    found = None
    for f in os.listdir(WORK_DIR):
        if f.startswith(os.path.basename(out_prefix)):
            found = os.path.join(WORK_DIR, f)
            break
    if not found:
        raise RuntimeError("render failed " + out_prefix)
    im = Image.open(found)
    im.load()
    _render_cache[key] = im
    return im


def find_blocks(pdf, tag):
    """Locate every 'Question ID <hex>' marker and derive each question's
    page range (from its own start page to the page before the next
    question starts, or end of document)."""
    starts = []
    for pi, page in enumerate(pdf.pages):
        words = page.extract_words()
        texts = [w["text"] for w in words]
        if texts[:2] == ["Question", "ID"]:
            qid = texts[2]
            starts.append((pi, qid))
    blocks = []
    for i, (pi, qid) in enumerate(starts):
        end_pi = starts[i + 1][0] - 1 if i + 1 < len(starts) else len(pdf.pages) - 1
        blocks.append({"qid": qid, "start_page": pi, "end_page": end_pi})
    return blocks


def find_answer_boundary(words):
    """Find the 'ID: <qid> Answer' marker that separates question from
    answer/rationale. Returns (top, bottom) of that text, or (None, None)
    if not present on this page."""
    for i in range(len(words) - 2):
        if words[i]["text"] == "ID:" and words[i + 2]["text"] == "Answer":
            return words[i]["top"], words[i]["bottom"]
    return None, None


def find_content_start(words, qid):
    """Find the bottom y of the 'ID: <qid>' start marker (not the Answer
    one), so we can crop out the header table above it."""
    for i in range(len(words) - 1):
        if words[i]["text"] == "ID:" and words[i + 1]["text"] == qid:
            if i + 2 >= len(words) or words[i + 2]["text"] != "Answer":
                return words[i]["bottom"]
    return None


def find_choice_boxes(words):
    """Find A./B./C./D. choice-letter markers (left-aligned near the page
    margin) and return each one's vertical span, for building clickable
    overlay regions on the question image."""
    markers = []
    for w in words:
        if w["text"] in ("A.", "B.", "C.", "D.") and w["x0"] < 40:
            markers.append({"letter": w["text"][0], "top": w["top"]})
    if len(markers) < 2:
        return []
    markers.sort(key=lambda m: m["top"])
    boxes = []
    for i, m in enumerate(markers):
        bottom = markers[i + 1]["top"] if i + 1 < len(markers) else None
        boxes.append({"letter": m["letter"], "top": m["top"], "bottom": bottom})
    return boxes


def get_metadata(words):
    """Pull domain / skill / correct answer / difficulty out of a page's
    (or combined pages') word list."""
    texts = [w["text"] for w in words]
    full_text = unicodedata.normalize("NFKC", " ".join(texts))
    domain, skill = None, None
    sat_idx = None
    for i, w in enumerate(words):
        if w["text"] == "SAT" and i + 1 < len(words) and words[i + 1]["text"] == "Math":
            sat_idx = i
            break
    if sat_idx is not None:
        row_top = words[sat_idx]["top"]
        row_words = [w for w in words if abs(w["top"] - row_top) < 3]
        # Column x-ranges from the metadata table header row:
        # Assessment ~18  Test ~128  Domain ~238  Skill ~348  Difficulty ~458
        domain_words = [w["text"] for w in row_words if 220 <= w["x0"] < 340]
        skill_words = [w["text"] for w in row_words if 340 <= w["x0"] < 450]
        domain = " ".join(domain_words) if domain_words else None
        skill = " ".join(skill_words) if skill_words else None
        # Domain/Skill can wrap onto a second line within the same cell.
        for w in words:
            if row_top < w["top"] < row_top + 30 and 340 <= w["x0"] < 450:
                skill = (skill + " " + w["text"]) if skill else w["text"]
            if row_top < w["top"] < row_top + 30 and 220 <= w["x0"] < 340:
                domain = (domain + " " + w["text"]) if domain else w["text"]

    correct_match = re.search(r"Correct Answer:\s*(.*?)\s*Rationale", full_text)
    correct = correct_match.group(1).strip() if correct_match else None
    diff_match = re.search(r"Question Difficulty:\s*(Easy|Medium|Hard)", full_text)
    difficulty = diff_match.group(1) if diff_match else None
    return domain, skill, correct, difficulty


def content_bottom_px(words, top_limit_pt=0):
    """Max bottom (in px) of words on a page at/after top_limit_pt --
    used to trim trailing blank space off cropped images."""
    relevant = [w for w in words if w["top"] >= top_limit_pt - 1]
    if not relevant:
        return None
    max_bottom = max(w["bottom"] for w in relevant)
    return min(PAGE_H_PX, int(max_bottom * SCALE) + MARGIN_PX)


def process_pdf(pdf_path, tag, id_prefix):
    """Extract every question from one PDF into a list of dicts, and
    write cropped question/answer images to OUT_IMG."""
    results = []
    with pdfplumber.open(pdf_path) as pdf:
        blocks = find_blocks(pdf, tag)
        print(f"{tag}: {len(blocks)} blocks")
        for bi, block in enumerate(blocks):
            qid = block["qid"]
            uid = f"{id_prefix}_{bi:03d}_{qid}"
            start_p = block["start_page"]
            end_p = block["end_page"]

            all_words_by_page = {}
            for pi in range(start_p, end_p + 1):
                all_words_by_page[pi] = pdf.pages[pi].extract_words()

            # Locate the front/back boundary (may be on start_p or an
            # overflow page, for unusually long questions).
            boundary_page, boundary_top, boundary_bottom = None, None, None
            for pi in range(start_p, end_p + 1):
                bt, bb = find_answer_boundary(all_words_by_page[pi])
                if bt is not None:
                    boundary_page, boundary_top, boundary_bottom = pi, bt, bb
                    break
            if boundary_page is None:
                boundary_page, boundary_top, boundary_bottom = end_p, 0, 0

            # Metadata: try the start page first; some fields (especially
            # "Correct Answer" and "Question Difficulty") can end up on a
            # later overflow page for long questions, so fall back to the
            # combined text of every page in the block.
            domain, skill, correct, difficulty = get_metadata(
                all_words_by_page[start_p]
            )
            if not difficulty or not correct:
                combined_words = []
                for pi in range(start_p, end_p + 1):
                    combined_words += all_words_by_page[pi]
                _, _, c2, d2 = get_metadata(combined_words)
                if not difficulty and d2:
                    difficulty = d2
                if not correct and c2:
                    correct = c2

            # Choice-letter hit-boxes, restricted to the "question part"
            # of the page(s) (above the answer boundary).
            choice_boxes_by_page = {}
            has_choices = False
            for pi in range(start_p, boundary_page + 1):
                ws = all_words_by_page[pi]
                if pi == boundary_page:
                    ws = [w for w in ws if w["top"] < boundary_top]
                boxes = find_choice_boxes(ws)
                if boxes:
                    has_choices = True
                    choice_boxes_by_page[pi] = boxes

            content_start_bottom = find_content_start(all_words_by_page[start_p], qid)
            # The navy header/footer bars extend a bit beyond their text
            # on both sides; these paddings (in PDF points) were measured
            # directly off a rendered sample page and are consistent
            # across the whole document.
            PAD_BELOW = 7  # gap from text bottom to navy bar's bottom edge
            PAD_ABOVE = 9  # gap from text top to navy bar's top edge

            # ---- FRONT images (question) ----
            front_images = []
            for pi in range(start_p, boundary_page + 1):
                im = render_page(pdf_path, pi + 1, tag)
                top_crop = 0
                if pi == start_p and content_start_bottom is not None:
                    top_crop = int((content_start_bottom + PAD_BELOW) * SCALE)
                if pi == boundary_page:
                    bottom_crop = int((boundary_top - PAD_ABOVE) * SCALE)
                else:
                    cb = content_bottom_px(all_words_by_page[pi])
                    bottom_crop = cb if cb else im.height
                bottom_crop = max(bottom_crop, top_crop + 10)
                cropped = im.crop((0, top_crop, im.width, bottom_crop))
                fname = f"{OUT_IMG}/{uid}_q{pi-start_p}.png"
                cropped.save(fname, optimize=True)
                front_images.append(os.path.basename(fname))

            # ---- BACK images (answer + rationale) ----
            back_images = []
            for pi in range(boundary_page, end_p + 1):
                im = render_page(pdf_path, pi + 1, tag)
                top_crop = (
                    int((boundary_bottom + PAD_BELOW) * SCALE)
                    if pi == boundary_page
                    else 0
                )
                cb = content_bottom_px(
                    all_words_by_page[pi], boundary_top if pi == boundary_page else 0
                )
                bottom_crop = cb if cb else im.height
                bottom_crop = max(bottom_crop, top_crop + 10)
                cropped = im.crop((0, top_crop, im.width, bottom_crop))
                fname = f"{OUT_IMG}/{uid}_a{pi-boundary_page}.png"
                cropped.save(fname, optimize=True)
                back_images.append(os.path.basename(fname))

            # Choice-letter pixel coordinates, relative to their front
            # image (accounting for the header crop offset on the first
            # page of the block).
            choice_overlay = []
            crop_offset_px = (
                (int((content_start_bottom + PAD_BELOW) * SCALE))
                if content_start_bottom is not None
                else 0
            )
            for pi, boxes in choice_boxes_by_page.items():
                img_idx = pi - start_p
                offset = crop_offset_px if pi == start_p else 0
                for b in boxes:
                    top_px = int(b["top"] * SCALE) - offset
                    bottom_px = (
                        (int(b["bottom"] * SCALE) - offset) if b["bottom"] else None
                    )
                    choice_overlay.append(
                        {
                            "letter": b["letter"],
                            "page_idx": img_idx,
                            "top": top_px,
                            "bottom": bottom_px,
                        }
                    )

            first_im = Image.open(f"{OUT_IMG}/{front_images[0]}")
            img_w, img_h = first_im.size

            results.append(
                {
                    "uid": uid,
                    "source": tag,
                    "domain": domain,
                    "skill": skill,
                    "difficulty": difficulty,
                    "correct": correct,
                    "has_choices": has_choices,
                    "front_images": front_images,
                    "back_images": back_images,
                    "choice_overlay": choice_overlay,
                    "img_w": img_w,
                }
            )
            if bi % 15 == 0:
                _render_cache.clear()  # keep memory bounded on long runs
                print(f"  {tag} processed {bi}/{len(blocks)}")
        _render_cache.clear()
    return results


# ---- Configure your inputs/outputs here ----
PDF_SOURCES = [
    (r"C:\Users\kevin\Downloads\sat\sat.pdf", "sat", "S"),
    (r"C:\Users\kevin\Downloads\sat\srcdoc.pdf", "srcdoc", "D"),
]

if __name__ == "__main__":
    all_results = []
    for pdf_path, tag, prefix in PDF_SOURCES:
        all_results += process_pdf(pdf_path, tag, prefix)
    with open(OUT_JSON, "w") as f:
        json.dump(all_results, f, indent=1)
    print("TOTAL:", len(all_results))
