# Template: classic-plain

- **Type:** CV
- **Engine:** pdflatex
- **Page limit:** 2 pages
- **Fonts:** Computer Modern (system font - standard LaTeX distribution)
- **Class/packages:** article, geometry, enumitem, titlesec, hyperref (all standard)

## Compile command

    cd <output dir> && pdflatex -interaction=nonstopmode <file>.tex

## Style rules

- Plain black-and-white design, no color accents
- Section headers use small-caps with a horizontal rule underneath
- 11pt font on A4 paper with 0.85in margins
- Experience entries use: **Title** — Company \hfill Dates
- Education entries use: **Degree** — Institution \hfill Dates
- Itemize lists have compact spacing (itemsep=2pt)
- Centered header with name in Huge bold, contact info on next line
- Profile section comes first, then Experience, then Education

## Known pitfalls

- none yet
