import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal/legal-page";
import { getSettings, publicSite } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const { siteName, legal } = publicSite(getSettings());

  return (
    <LegalPage title="Privacy Policy" effectiveDate={legal.effectiveDate}>
      <p>
        This Privacy Policy explains which personal data we process when you use {siteName} (the
        &quot;Service&quot;), why we process it, and which rights you have. We keep data processing
        to what is needed to run the Service: there is no advertising, no analytics tracking and no
        sale of personal data.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        The controller responsible for the processing of your personal data is:
      </p>
      <p>
        <strong>{legal.operatorName}</strong>
        {legal.operatorAddress ? (
          <>
            <br />
            <span className="whitespace-pre-line">{legal.operatorAddress}</span>
          </>
        ) : null}
        <br />
        Contact: <ContactEmail email={legal.contactEmail} />
      </p>
      <p>
        Further details are available in our <Link href="/imprint">Legal Notice</Link>.
      </p>

      <h2>2. What we process</h2>
      <h3>Account data</h3>
      <p>
        When you register we store your email address, the name you optionally provide, the date of
        registration, the time of your last sign-in, and the version of the Terms of Use you
        accepted together with the time of acceptance. Your password is never stored in readable
        form: we only keep a salted cryptographic hash (Argon2id).
      </p>
      <h3>Conversations</h3>
      <p>
        We store the messages you send, the responses generated for you, the title of each
        conversation, which model was used, and the associated timestamps, so that you can return
        to your conversations. You can delete individual conversations or all of them at any time.
      </p>
      <h3>Usage records</h3>
      <p>
        For every request we record the time, the model used, the number of tokens processed and
        an estimate of the cost. These records contain no message content. We use them to enforce
        daily limits, prevent abuse and plan capacity.
      </p>
      <h3>Session and security data</h3>
      <p>
        While you are signed in we store a session record containing a hash of your session token,
        your browser&apos;s user-agent string, timestamps, and a keyed hash of your IP address. We
        also keep a security log of events such as sign-ins, failed sign-in attempts, password
        changes and administrative actions, again with a keyed hash of the IP address. The hash
        allows us to recognise repeated abuse from the same address without storing the address
        itself in our database.
      </p>
      <p>
        As with any website, your IP address is technically necessary to deliver pages to your
        device and is processed by our server and hosting infrastructure for that purpose.
      </p>

      <h2>3. Why we process it and on what legal basis</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Legal basis (GDPR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Providing the Service: your account, your conversations, generating responses</td>
              <td>Performance of a contract, Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>
                Security, preventing abuse and fraud, enforcing usage limits, capacity planning
              </td>
              <td>Legitimate interests, Art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Remembering your interface preferences (theme, layout, preferred model)</td>
              <td>Legitimate interests, Art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Complying with legal obligations and responding to lawful requests</td>
              <td>Legal obligation, Art. 6(1)(c)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We do not use your data for advertising or profiling, and we do not make decisions that
        produce legal effects for you by purely automated means. Requests may be declined
        automatically by safety systems if they conflict with the{" "}
        <Link href="/acceptable-use">Acceptable Use Policy</Link>.
      </p>

      <h2>4. AI providers and other recipients</h2>
      <p>
        {siteName} is built on a combination of AI models, including models supplied by third-party
        providers. To generate a response, the message you send and the relevant part of the
        conversation history are transmitted to the provider of the selected model. We do not send
        your name, email address or account identifier with these requests.
      </p>
      <ul>
        <li>
          <strong>AI model providers</strong>, including Anthropic, PBC (San Francisco, USA),
          process conversation content on our behalf in order to generate responses. Under the
          terms that apply to our use of their services, providers may retain requests for a
          limited time for security and abuse-prevention purposes.
        </li>
        <li>
          <strong>Hosting and infrastructure providers</strong> operate the servers on which the
          Service and its database run.
        </li>
        <li>
          <strong>Authorities</strong>, where we are legally obliged to disclose data or where this
          is necessary to establish, exercise or defend legal claims.
        </li>
      </ul>
      <p>
        We do not sell your personal data, and we do not share it with advertisers. We do not use
        your conversations to train AI models of our own.
      </p>

      <h2>5. Transfers to other countries</h2>
      <p>
        Some recipients, in particular AI model providers, are located in the United States or
        process data there. Where personal data is transferred outside the European Economic Area,
        the United Kingdom or Switzerland, we rely on an adequacy decision (such as the EU–US Data
        Privacy Framework, where the recipient is certified) or on standard contractual clauses
        approved by the European Commission. You can ask us for more information about these
        safeguards.
      </p>

      <h2>6. Cookies and local storage</h2>
      <p>
        We only use cookies that are necessary for the Service or that remember your own interface
        choices. We do not use analytics, advertising or third-party cookies, and the pages do not
        load resources such as fonts or scripts from third-party servers.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>__Host-crafting_session</code>
              </td>
              <td>Keeps you signed in. Strictly necessary.</td>
              <td>Up to 30 days</td>
            </tr>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>Remembers light or dark mode.</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>
                <code>crafting_tier</code>
              </td>
              <td>Remembers the model you last selected.</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>
                <code>crafting_sidebar</code>
              </td>
              <td>Remembers whether the sidebar is collapsed.</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>
          <strong>Account data and conversations:</strong> until you delete them or delete your
          account. Deleting your account removes your profile, sessions and all conversations
          immediately.
        </li>
        <li>
          <strong>Sessions:</strong> until you sign out, or at most 30 days (14 days without
          activity).
        </li>
        <li>
          <strong>Security log:</strong> 6 months.
        </li>
        <li>
          <strong>Usage records:</strong> about 13 months. When you delete your account, existing
          usage records are detached from it and kept only as anonymous statistics.
        </li>
        <li>
          <strong>Backups:</strong> deleted data may remain in backups for a limited period before
          it is overwritten.
        </li>
      </ul>
      <p>We keep data longer only where the law requires us to.</p>

      <h2>8. How we protect data</h2>
      <p>
        All connections to the Service are encrypted (HTTPS). Passwords are stored only as Argon2id
        hashes and session tokens only as hashes. Access to the administration area is restricted
        to authorised administrators, and the administration interface does not display the
        content of conversations. Conversation content is stored in the Service&apos;s database on
        our server; we access it only where this is necessary to operate the Service, to
        investigate reported abuse or security incidents, or to comply with the law.
      </p>
      <p>
        No system is perfectly secure. Please do not share confidential or highly sensitive
        information in your conversations.
      </p>

      <h2>9. Your rights</h2>
      <p>Subject to the conditions of applicable data-protection law, you have the right to:</p>
      <ul>
        <li>obtain access to the personal data we hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data erased;</li>
        <li>have the processing of your data restricted;</li>
        <li>receive your data in a portable format;</li>
        <li>
          object to processing that is based on our legitimate interests, on grounds relating to
          your particular situation;
        </li>
        <li>
          lodge a complaint with a data-protection supervisory authority, in particular in the
          country where you live or work.
        </li>
      </ul>
      <p>
        You can exercise several of these rights yourself in the account settings: you can
        download an export of your data, delete conversations, and delete your account. For
        anything else, write to <ContactEmail email={legal.contactEmail} />.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not intended for anyone under {legal.minimumAge} years of age, and we do not
        knowingly collect personal data from younger users. If you believe a child has created an
        account, please contact us so that we can delete it.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy when the Service or legal requirements change. The
        current version is always available on this page. We will inform you in the Service about
        significant changes.
      </p>
    </LegalPage>
  );
}
