import { OfficeEnquiryForm } from "@/app/(web)/properties/_components/office-enquiry-form";
import { Reveal } from "./reveal";

// One line and a short enquiry form on the page colour, hairlines above and below
export function LuxIntroduction() {
  return (
    <section className="border-y border-lx-line bg-lx-page">
      <Reveal className="container-site grid gap-10 py-24 lg:grid-cols-[1fr_380px] lg:items-center lg:gap-16 lg:py-32">
        <div className="max-w-3xl">
          <p className="lx-numeral">03</p>
          <h2 className="mt-5 font-display text-[clamp(26px,3vw,40px)] font-normal leading-[1.1] tracking-[-0.01em] text-lx-text">
            Some of the finest homes in Dubai are never advertised.
            <span className="italic text-lx-pale"> Tell us what you are looking for.</span>
          </h2>
        </div>
        <OfficeEnquiryForm scope="general" />
      </Reveal>
    </section>
  );
}
