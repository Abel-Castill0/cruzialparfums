"""Native-text/layout bridge for the Sexto Consolidado staging extractor.

This helper performs no OCR and writes no files. It emits deterministic JSON
to stdout so the Node parser can keep all commercial decisions in pure,
unit-testable JavaScript.
"""

import argparse
import json
import logging

import pdfplumber


ROW_BANDS = ((190, 390), (480, 680), (760, 920))


def overlap_count(images, bbox):
    left, top, right, bottom = bbox
    count = 0
    for image in images:
        image_left = float(image.get("x0", 0))
        image_right = float(image.get("x1", 0))
        image_top = float(image.get("top", 0))
        image_bottom = float(image.get("bottom", 0))
        if image_right > left and image_left < right and image_bottom > top and image_top < bottom:
            count += 1
    return count


def extract(source):
    pages = []
    with pdfplumber.open(source) as document:
        for page_number, page in enumerate(document.pages, start=1):
            deduped = page.dedupe_chars(tolerance=2)
            page_text = deduped.extract_text(x_tolerance=2, y_tolerance=3) or ""
            cells = []
            for row_index, (top, bottom) in enumerate(ROW_BANDS):
                for column_index in range(4):
                    left = page.width * column_index / 4
                    right = page.width * (column_index + 1) / 4
                    bbox = (left, top, right, bottom)
                    raw_text = (
                        deduped.crop(bbox).extract_text(x_tolerance=2, y_tolerance=3) or ""
                    ).strip()
                    cells.append(
                        {
                            "block_index": row_index * 4 + column_index + 1,
                            "raw_text": raw_text,
                            "image_objects_overlapping": overlap_count(page.images, bbox),
                        }
                    )
            pages.append(
                {
                    "page": page_number,
                    "native_text": page_text.strip(),
                    "native_text_characters": len(page_text.strip()),
                    "image_objects": len(page.images),
                    "cells": cells,
                }
            )
    return {"page_count": len(pages), "pages": pages}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    print(json.dumps(extract(args.source), ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
