// PSAT Math question bank — add questions below in the same format as math.js / english.js.
// Images are referenced by filename and resolved against the "images/" folder
// (e.g. front_images: ["P_000_x_q0.webp"] -> images/P_000_x_q0.webp).
// Rendered question images are 1105px wide (img_w: 1105).
//
// Field reference (one entry per question):
//   uid           unique id, any string (prefix with P_ to be safe)
//   active        keep false; the app manages per-question status itself
//   source        "psat"
//   domain        one of: Algebra | Advanced Math | Geometry and Trigonometry
//   skill         free text, shown in the sidebar/topbar breadcrumbs
//   difficulty    Easy | Medium | Hard
//   correct       "A"-"D" for multiple choice, otherwise the exact free-response
//                 string the grader expects (e.g. "3", "-10", "3/2", "1.5")
//   has_choices   true -> A/B/C/D buttons (needs choice_overlay), false -> typed input
//   front_images  question page images, in order (page_idx 0, 1, ...)
//   back_images   answer/explanation page images, in order
//   choice_overlay for each A-D: which page it sits on and its vertical band
//                 (pixels in the original 1105-wide image; bottom: null on the last)
//   img_w         1105
//
// Example (multiple choice):
// {
//   uid: "P_000_example",
//   active: false,
//   source: "psat",
//   domain: "Algebra",
//   skill: "Linear equations in one variable",
//   difficulty: "Medium",
//   correct: "B",
//   has_choices: true,
//   front_images: ["P_000_example_q0.webp"],
//   back_images: ["P_000_example_a0.webp"],
//   choice_overlay: [
//     { letter: "A", page_idx: 0, top: 528, bottom: 571 },
//     { letter: "B", page_idx: 0, top: 571, bottom: 613 },
//     { letter: "C", page_idx: 0, top: 613, bottom: 656 },
//     { letter: "D", page_idx: 0, top: 656, bottom: null },
//   ],
//   img_w: 1105,
// },
//
// Example (free response):
// {
//   uid: "P_001_example",
//   active: false,
//   source: "psat",
//   domain: "Standard English Conventions",
//   skill: "Boundaries",
//   difficulty: "Easy",
//   correct: "which",
//   has_choices: false,
//   front_images: ["P_001_example_q0.webp"],
//   back_images: ["P_001_example_a0.webp"],
//   choice_overlay: [],
//   img_w: 1105,
// },

const QUESTIONS = [
  // <-- paste PSAT questions here
];
