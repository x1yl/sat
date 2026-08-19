# SAT PDF -> quiz site: extraction pipeline

Two scripts, run in order:

1. **extract_questions.py**
   Parses the College Board Question Bank PDF export(s) into
   `questions.json` plus cropped question/answer PNGs (one pair of
   images per question, in `WORK_DIR/images`).

   Edit `PDF_SOURCES` at the bottom of the file to point at your PDFs,
   and `WORK_DIR` near the top for where output should go.

2. **build_site_data.py**
   Converts those PNGs to WebP (smaller file size, same visual
   quality) and writes `data.js`, a JS file that defines a global
   `QUESTIONS` array -- this is what the site's `index.html` loads
   directly via a `<script>` tag.

   Edit `WORK_DIR` / `SITE_DIR` near the top if you changed them in
   step 1.

## Requirements

```
pip install pdfplumber pillow --break-system-packages
apt-get install poppler-utils   # provides pdftoppm, used to rasterize pages
```

## Why images instead of extracted text?

These PDF exports render most equations and all graphs as embedded
images rather than selectable text, so plain text extraction leaves
gaps where that content should be. `extract_questions.py` instead
uses pdfplumber's word-position data only to find _structural_
markers (where a question starts, where the answer section begins,
where each A/B/C/D choice sits) -- then rasterizes the actual page
and crops around those coordinates, so nothing visual is lost. It
also emits pixel coordinates for each answer choice, which the site
uses to draw invisible clickable regions directly on top of the
question image.

## Output data shape

Each entry in `questions.json` / `QUESTIONS`:

```
{
  "uid": "S_000_455fd7e9",
  "source": "sat",
  "domain": "Advanced Math",
  "skill": "Nonlinear functions",
  "difficulty": "Hard",
  "correct": "D",                 // letter, or a raw value for free-response
  "has_choices": true,            // false = student-produced response
  "front_images": ["..._q0.webp"],// question image(s), in order
  "back_images": ["..._a0.webp"], // answer + rationale image(s), in order
  "choice_overlay": [             // pixel hit-boxes for has_choices questions
    {"letter": "A", "page_idx": 0, "top": 762, "bottom": 805}, ...
  ],
  "img_w": 1105                   // native pixel width all images share
}
```
