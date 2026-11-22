import UnderwriteDesk from "./UnderwriteDesk";

export const metadata = { title: "Underwrite a home · ReEntry" };

export default function UnderwritePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Underwrite a home</h1>
        <p className="text-muted mt-1 max-w-3xl">
          A FAIR Plan applicant, priced as a voluntary-market risk: location hazard from FEMA and CAL FIRE, construction
          vulnerability from the inspection model, and the cheapest mitigation that brings the home inside your appetite.
        </p>
      </header>
      <UnderwriteDesk />
    </div>
  );
}
