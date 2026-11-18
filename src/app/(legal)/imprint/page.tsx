import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getSettings, publicSite } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Legal Notice" };

export default function ImprintPage() {
  const { siteName, legal } = publicSite(getSettings());
  const incomplete = !legal.operatorAddress || !legal.contactEmail;

  return (
    <LegalPage title="Legal Notice">
      <h2>Operator of {siteName}</h2>
      <p>
        <strong>{legal.operatorName}</strong>
        {legal.operatorAddress ? (
          <>
            <br />
            <span className="whitespace-pre-line">{legal.operatorAddress}</span>
          </>
        ) : null}
      </p>

      <h2>Contact</h2>
      {legal.contactEmail ? (
        <p>
          Email: <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
        </p>
      ) : null}
      {incomplete ? (
        <p>The operator&apos;s full contact details will be published here shortly.</p>
      ) : null}

      <h2>Responsibility for content</h2>
      <p>
        The operator named above is responsible for the editorial content of this website.
        Responses produced by the AI assistant are generated automatically at the request of the
        respective user; they are not editorial content and do not represent the views of the
        operator.
      </p>

      <h2>External links</h2>
      <p>
        AI-generated responses may contain links to external websites. We have no influence on the
        content of those websites and accept no responsibility for it; the respective provider is
        always responsible for the content of linked pages.
      </p>
    </LegalPage>
  );
}
