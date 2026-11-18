import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal/legal-page";
import { getSettings, publicSite } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage() {
  const { siteName, legal } = publicSite(getSettings());

  return (
    <LegalPage title="Acceptable Use Policy" effectiveDate={legal.effectiveDate}>
      <p>
        This policy describes what you may not do with {siteName}. It is part of our{" "}
        <Link href="/terms">Terms of Use</Link>. We want {siteName} to be useful and safe for
        everyone, so we ask you to use it responsibly.
      </p>

      <h2>1. Do not use the Service to break the law or cause harm</h2>
      <p>You may not use the Service to create, request or distribute content that:</p>
      <ul>
        <li>is illegal, or promotes or facilitates illegal activity;</li>
        <li>
          sexualises minors, or exploits or endangers children in any way;
        </li>
        <li>
          threatens, harasses, bullies or defames people, or incites violence or hatred against
          individuals or groups, for example because of their origin, religion, gender, sexual
          orientation or disability;
        </li>
        <li>
          gives instructions for weapons capable of mass casualties, for other serious violence, or
          for self-harm;
        </li>
        <li>
          is malicious software, or helps to attack, damage or gain unauthorised access to systems,
          networks or data;
        </li>
        <li>
          is designed to deceive or defraud, such as phishing messages, scams, fake reviews or
          fabricated documents;
        </li>
        <li>
          spreads deliberate disinformation, in particular to interfere with elections or to
          endanger public health or safety;
        </li>
        <li>
          violates other people&apos;s privacy, for example by collecting, exposing or tracking
          personal data without a legal basis;
        </li>
        <li>infringes copyrights, trademarks or other rights of third parties;</li>
        <li>is sexually explicit material.</li>
      </ul>

      <h2>2. Do not mislead people about AI</h2>
      <ul>
        <li>
          Do not present AI-generated output as written by a human where this would deceive
          someone, and do not impersonate real people or organisations.
        </li>
        <li>
          Do not use responses as the sole basis for decisions that seriously affect people — for
          example in medicine, law, employment, credit, housing or education — without review by a
          qualified person.
        </li>
      </ul>

      <h2>3. Do not abuse the Service</h2>
      <ul>
        <li>
          Do not try to bypass safety measures, content filters or usage limits, for example
          through &quot;jailbreak&quot; prompts or by creating several accounts.
        </li>
        <li>
          Do not access the Service through scripts, bots, scrapers or other automated means, and
          do not resell or share your access.
        </li>
        <li>
          Do not probe, scan or test the vulnerability of the Service, disrupt it, or overload it.
          If you discover a security problem, please report it to us responsibly instead.
        </li>
        <li>
          Do not use the Service or its output to build or train a competing AI model, and do not
          try to extract the underlying models, system instructions or other confidential
          technical information.
        </li>
      </ul>

      <h2>4. Enforcement</h2>
      <p>
        Requests that violate this policy may be declined automatically. If we become aware of a
        violation, we may remove content, limit your usage, or suspend or terminate your account,
        depending on how serious the violation is. We may also inform law-enforcement authorities
        where the law requires or permits it.
      </p>

      <h2>5. Reporting</h2>
      <p>
        To report abuse, illegal content or a security issue, write to{" "}
        <ContactEmail email={legal.contactEmail} />. Please include enough detail for us to
        understand and investigate your report.
      </p>
    </LegalPage>
  );
}
