import { applicants } from "@/lib/data";
import BookBuilder from "./BookBuilder";

export const metadata = { title: "Build a book · ReEntry" };

export default function BookPage() {
  const apps = applicants();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Build a book</h1>
        <p className="text-muted mt-1 max-w-3xl">
          {apps.length.toLocaleString()} real homes that survived the January 2025 Eaton and Palisades fires, as recorded by CAL FIRE
          inspectors and joined to LA County assessor floor area. Many of their owners are now on the FAIR Plan. Set your appetite
          and see which you would write, at what premium, and how much of the book one repeat fire could take.
          Addresses are removed; locations are rounded to about 100 m.
        </p>
      </header>
      <BookBuilder apps={apps} />
    </div>
  );
}
