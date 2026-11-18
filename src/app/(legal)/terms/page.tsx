import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal/legal-page";
import { getSettings, publicSite } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  const { siteName, assistantName, legal } = publicSite(getSettings());
  const operator = legal.operatorName;

  return (
    <LegalPage title="Terms of Use" effectiveDate={legal.effectiveDate}>
      <p>
        These Terms of Use (&quot;Terms&quot;) govern your access to and use of {siteName}, including
        the AI assistant {assistantName} and all related features (together, the
        &quot;Service&quot;). The Service is operated by {operator} (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;). Our contact details are listed in the{" "}
        <Link href="/imprint">Legal Notice</Link>.
      </p>
      <p>
        By creating an account or using the Service you agree to these Terms. If you do not agree,
        please do not use the Service.
      </p>

      <h2>1. Who may use the Service</h2>
      <ul>
        <li>
          You must be at least {legal.minimumAge} years old. If the law of your country requires a
          higher age to consent to the use of online services, that higher age applies.
        </li>
        <li>
          You may only use the Service if you can form a binding contract with us and are not
          barred from doing so under applicable law.
        </li>
        <li>
          If you use the Service on behalf of an organisation, you confirm that you are authorised
          to accept these Terms for that organisation.
        </li>
      </ul>

      <h2>2. Your account</h2>
      <ul>
        <li>You need an account to use the Service. Provide accurate information and keep it up to date.</li>
        <li>
          Keep your password confidential. You are responsible for activity that takes place
          through your account. Tell us promptly if you believe your account has been compromised.
        </li>
        <li>
          Accounts are personal. Do not share your account, and do not create several accounts to
          get around usage limits.
        </li>
      </ul>

      <h2>3. The Service</h2>
      <p>
        {siteName} lets you hold conversations with an AI assistant. You can choose between several
        models that differ in capability and in how many messages you can send per day.
      </p>
      <ul>
        <li>
          <strong>Free of charge.</strong> Unless we expressly state otherwise, the Service is
          provided free of charge. Because it is free, it is offered within the limits of our
          technical and financial capacity.
        </li>
        <li>
          <strong>Usage limits.</strong> We apply limits, such as a maximum number of messages per
          day and per model, and limits on message length. We may change these limits at any time.
        </li>
        <li>
          <strong>Availability.</strong> We aim to keep the Service available but do not guarantee
          uninterrupted or error-free operation. The Service may be unavailable during maintenance,
          when capacity is exhausted, or for reasons beyond our control.
        </li>
        <li>
          <strong>Changes.</strong> We may add, change or remove features and models, or
          discontinue the Service entirely. Where reasonably possible we will announce significant
          changes in advance.
        </li>
      </ul>

      <h2>4. AI-generated content</h2>
      <p>
        Responses are generated automatically by artificial intelligence. Please keep the following
        in mind:
      </p>
      <ul>
        <li>
          <strong>Responses can be wrong.</strong> Output may be inaccurate, incomplete, outdated,
          biased or offensive, even when it sounds confident. Check important information against
          reliable sources before relying on it.
        </li>
        <li>
          <strong>No professional advice.</strong> The Service does not provide medical, legal,
          financial, tax, psychological or other professional advice and is no substitute for a
          qualified professional. In an emergency, contact your local emergency services.
        </li>
        <li>
          <strong>No human review.</strong> Responses are not reviewed by a person before you
          receive them and do not represent our views.
        </li>
        <li>
          <strong>Not unique.</strong> Other users may receive the same or similar responses to
          similar requests.
        </li>
        <li>
          <strong>Your responsibility.</strong> You decide how to use a response and you are
          responsible for that use, including making sure it is lawful and does not infringe the
          rights of others.
        </li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        &quot;Your content&quot; means the text you submit to the Service and the responses
        generated for you.
      </p>
      <ul>
        <li>
          <strong>Ownership.</strong> As between you and us, you keep all rights you have in the
          content you submit. To the extent permitted by law, we do not claim ownership of the
          responses generated for you.
        </li>
        <li>
          <strong>Permission to operate the Service.</strong> You grant us a non-exclusive,
          worldwide, royalty-free licence to host, store, transmit and process your content solely
          as needed to provide, secure and maintain the Service. This licence ends when your
          content is deleted from our systems.
        </li>
        <li>
          <strong>Your responsibility.</strong> You confirm that you have the rights necessary to
          submit your content and that it complies with these Terms and the law.
        </li>
        <li>
          <strong>Sensitive information.</strong> Do not submit confidential information, trade
          secrets, passwords, or sensitive personal data about yourself or other people (such as
          health data), unless you are entitled to and accept the associated risk.
        </li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>
        You must follow our <Link href="/acceptable-use">Acceptable Use Policy</Link>, which forms
        part of these Terms. In short: do not use the Service for anything illegal or harmful, do
        not attempt to break or bypass its safeguards or limits, and do not abuse it through
        automated means.
      </p>

      <h2>7. How responses are generated</h2>
      <p>
        {assistantName} is our own assistant: we design how it behaves and we operate the Service.
        To generate responses, {assistantName} uses large language models, some of which are
        operated by third-party providers. For this purpose your messages and the relevant
        conversation history are transmitted to those providers and processed by them on our
        behalf. Details are set out in our <Link href="/privacy">Privacy Policy</Link>. The
        providers&apos; usage policies also restrict what the models may be used for; requests that
        conflict with those policies may be declined.
      </p>

      <h2>8. Our rights</h2>
      <p>
        The Service itself, including its software, design, texts, logos and trademarks, belongs to
        us or our licensors and is protected by law. We grant you a personal, non-exclusive,
        non-transferable, revocable right to use the Service in accordance with these Terms. You
        may not copy, modify, resell or reverse engineer the Service, except where the law
        expressly allows it.
      </p>

      <h2>9. Suspension and termination</h2>
      <ul>
        <li>
          You may stop using the Service at any time and delete your account in the account
          settings. Deleting your account permanently removes your conversations.
        </li>
        <li>
          We may restrict, suspend or terminate your access if you violate these Terms or the
          Acceptable Use Policy, if your use creates a security or legal risk, or if we are
          required to do so by law. Where appropriate we will inform you and give you the
          opportunity to respond.
        </li>
        <li>
          We may also end the Service for all users. In that case we will give reasonable notice
          where possible so that you can export your data.
        </li>
      </ul>

      <h2>10. Disclaimer of warranties</h2>
      <p>
        The Service is provided free of charge, &quot;as is&quot; and &quot;as available&quot;. To
        the extent permitted by law, we make no promises about the accuracy, reliability,
        availability or fitness for a particular purpose of the Service or of any response. Rights
        that cannot be excluded under mandatory law, in particular mandatory consumer rights,
        remain unaffected.
      </p>

      <h2>11. Liability</h2>
      <ul>
        <li>
          We are liable without limitation for damage caused intentionally or by gross negligence,
          for injury to life, body or health, and where liability cannot be limited under mandatory
          law (for example under product liability law).
        </li>
        <li>
          In cases of slight negligence we are liable only for the breach of an essential
          contractual obligation, meaning an obligation whose fulfilment makes the proper
          performance of the contract possible in the first place and on which you may regularly
          rely. In that case our liability is limited to the foreseeable damage typical for this
          kind of contract.
        </li>
        <li>
          Otherwise, and to the extent permitted by law, we are not liable, in particular not for
          decisions you make on the basis of AI-generated responses, for loss of data that could
          have been avoided by a reasonable backup, or for indirect and consequential damage.
        </li>
        <li>
          These limitations also apply in favour of our employees, representatives and vicarious
          agents.
        </li>
      </ul>

      <h2>12. Your responsibility towards us</h2>
      <p>
        If third parties make claims against us because you culpably violated these Terms, the
        Acceptable Use Policy or the law when using the Service, you will compensate us for the
        resulting damage and reasonable costs of legal defence.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms, for example to reflect changes to the Service or to the law. We
        will publish the new version on this page with a new effective date. If a change is
        significant, we will notify you in the Service before it takes effect. If you continue to
        use the Service after the new Terms take effect, you accept them. If you do not agree, you
        can delete your account at any time.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        {legal.governingLaw
          ? `These Terms are governed by the laws of ${legal.governingLaw}, excluding its conflict-of-law rules.`
          : "These Terms are governed by the laws of the country in which the operator is established, excluding its conflict-of-law rules."}{" "}
        If you are a consumer, you additionally enjoy the protection of the mandatory provisions of
        the law of the country in which you habitually reside, and you may bring proceedings before
        the courts of that country. We are neither obliged nor willing to take part in dispute
        resolution proceedings before a consumer arbitration board.
      </p>

      <h2>15. Final provisions</h2>
      <p>
        If a provision of these Terms is or becomes invalid, the remaining provisions stay in
        effect. These Terms, together with the Acceptable Use Policy, are the entire agreement
        between you and us regarding the Service. You may not transfer your rights under these
        Terms without our consent.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms? Write to <ContactEmail email={legal.contactEmail} />.
      </p>
    </LegalPage>
  );
}
