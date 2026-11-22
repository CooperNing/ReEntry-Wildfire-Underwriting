"""Fictional sample documents for the AI extraction demo. Every page is stamped SAMPLE."""
from fpdf import FPDF
from pathlib import Path
OUT = Path(__file__).resolve().parents[1] / "web/public/samples"

def doc(title, sub, sections, fname):
    pdf = FPDF(format="Letter"); pdf.set_auto_page_break(True, 18); pdf.add_page()
    pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(180, 40, 40)
    pdf.cell(0, 5, "SAMPLE DOCUMENT - FICTIONAL, FOR SOFTWARE DEMONSTRATION ONLY", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0); pdf.set_font("Helvetica", "B", 16); pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10); pdf.multi_cell(0, 5, sub, new_x="LMARGIN", new_y="NEXT"); pdf.ln(3)
    for head, rows in sections:
        pdf.set_font("Helvetica", "B", 11); pdf.set_fill_color(235, 235, 235)
        pdf.cell(0, 7, head, fill=True, new_x="LMARGIN", new_y="NEXT"); pdf.ln(1)
        for r in rows:
            if isinstance(r, tuple):
                pdf.set_font("Helvetica", "B", 10); pdf.cell(62, 6, r[0])
                pdf.set_font("Helvetica", "", 10); pdf.multi_cell(0, 6, r[1], new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.set_font("Helvetica", "", 10); pdf.multi_cell(0, 5, r, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
    pdf.output(OUT / fname)

doc("Home Wildfire Mitigation Assessment",
    "Prepared by: Sierra Ember Inspections (fictional) - Inspector ID SE-0417\nInspection date: October 14, 2026\nProperty: single-family residence, Altadena area, Los Angeles County",
    [("1. Structure", [("Occupancy", "Single-family dwelling, owner occupied"),
                       ("Stories", "One story over raised foundation"),
                       ("Year built", "1949 (per county assessor)"),
                       ("Living area", "1,850 sq ft")]),
     ("2. Roof", [("Covering", "Composition asphalt shingle, approx. 12 years old. Class rating label not visible from ground."),
                  ("Gutters", "Open metal gutters, pine needle accumulation on north side at time of visit.")]),
     ("3. Eaves and vents", [("Eaves", "Open eave construction; exposed rafter tails visible on all elevations."),
                             ("Attic vents", "Gable and soffit vents fitted with 1/4-inch galvanized mesh."),
                             ("Foundation vents", "1/4-inch mesh, two screens torn on west elevation.")]),
     ("4. Walls, windows, attachments", [("Exterior walls", "Cement plaster (stucco) on all elevations."),
                             ("Windows", "Original single-pane wood-frame windows throughout, except a single dual-pane unit in the kitchen."),
                             ("Deck", "No elevated deck. Concrete patio at grade, rear."),
                             ("Fence", "Wood privacy fence attaches directly to the house at the northeast corner."),
                             ("Outbuildings", "Wood storage shed approximately 20 feet from the rear wall.")]),
     ("5. Inspector notes", ["Recommend replacing 1/4-inch vent mesh with 1/8-inch ember-resistant vents, installing a metal gate where the fence meets the house, and relocating the shed. Defensible space Zone 1 generally compliant; Zone 0 has bark mulch against the foundation."])],
    "inspection_altadena.pdf")

doc("Homeowners Application - Property Questionnaire",
    "Agency: Coastline Brokerage (fictional)   Applicant: [redacted]   Prepared: November 3, 2026\nCurrent carrier: California FAIR Plan (dwelling fire) + DIC policy",
    [("Section A - Dwelling", [("Construction", "Frame with stucco exterior"),
                              ("Number of stories", "2"),
                              ("Year of construction", "1987"),
                              ("Square footage (living)", "2,900"),
                              ("Replacement cost estimate", "$1,650,000 (agent estimate)")]),
     ("Section B - Wildfire features", [("Roof type", "Concrete tile, Class A, replaced 2019"),
                              ("Eaves / soffits", "Boxed (enclosed) soffits"),
                              ("Vents", "Ember- and flame-resistant vents (1/8 inch) installed March 2025, invoice attached"),
                              ("Windows", "Dual-pane, tempered glass on west side"),
                              ("Decks", "Elevated composite deck off second floor, approx. 300 sq ft"),
                              ("Fences within 5 ft of home", "Metal gate where fence meets the house; remainder of fence is wood"),
                              ("Detached structures", "None"),
                              ("Community program", "Neighborhood is a recognized Firewise USA site")]),
     ("Section C - Loss history", ["No losses in the past 5 years. Non-renewed by prior voluntary carrier in 2024 citing wildfire exposure."])],
    "application_palisades.pdf")

doc("Notice of Non-Renewal",
    "Golden Hills Mutual Insurance (fictional)   Policy HO3-00000000   Mailed: July 1, 2026",
    [("Notice", ["We will not renew your homeowners policy when it expires on September 1, 2026.",
                 "Reason: the property is located in an area where our wildfire exposure exceeds our underwriting guidelines.",
                 "You may be eligible for coverage through the California FAIR Plan. You have the right to request a review by the California Department of Insurance."])],
    "nonrenewal_letter.pdf")
print(sorted(p.name for p in OUT.iterdir()))
