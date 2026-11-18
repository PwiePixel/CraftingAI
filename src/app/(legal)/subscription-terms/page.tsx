import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/legal/legal-page";
import { hasPaidPlans } from "@/lib/server/plans";
import { getSettings, publicSite } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Subscription Terms" };

export default function SubscriptionTermsPage() {
  const settings = getSettings();
  const { siteName, assistantName, legal } = publicSite(settings);
  const operator = legal.operatorName;
  const offered = hasPaidPlans(settings);
  const currency = settings.billing.currency.toUpperCase();

  return (
    <LegalPage title="Subscription Terms" effectiveDate={legal.effectiveDate}>
      <p>
        These Subscription Terms are the contract terms for buying a paid plan on {siteName}. They
        apply in addition to our <Link href="/terms">Terms of Use</Link>, which govern the use of
        the service in general. Where the two differ on a question about paid plans, these
        Subscription Terms take precedence.
      </p>
      {offered ? null : (
        <p>
          <strong>No paid plans are offered for new orders at the moment.</strong> These terms
          continue to apply to subscriptions that are still running.
        </p>
      )}

      <h2>1. Parties</h2>
      <p>
        The contract is concluded between you and {operator} (&quot;we&quot;, &quot;us&quot;,
        &quot;our&quot;), the operator of {siteName}. Our name, address and contact details are
        listed in the <Link href="/imprint">Legal Notice</Link>. You need a {siteName} account to
        buy a paid plan, and you must be at least 18 years old or have the consent of a parent or
        legal guardian.
      </p>

      <h2>2. What you buy</h2>
      <p>
        A paid plan is a subscription to a digital service. It raises the number of messages you
        can send to {assistantName} for as long as the subscription runs.
      </p>
      <ul>
        <li>
          <strong>Scope.</strong> Each plan lists, for every model it includes, how many messages
          you can send within five hours and within a week. Both limits apply at the same time.
          They are rolling windows: a message stops counting exactly five hours, or seven days,
          after you sent it. A plan may leave out individual models.
        </li>
        <li>
          <strong>Where to find it.</strong> The plans, their limits and their prices are shown on
          the plan page in your account settings before you order. What is shown there at the time
          of your order is what you buy. Your current usage is shown in your account settings.
        </li>
        <li>
          <strong>What a plan is not.</strong> A plan gives you access to the service within its
          limits. It does not guarantee a particular quality or content of the answers, and unused
          messages do not carry over.
        </li>
        <li>
          <strong>Personal use of the account.</strong> A plan belongs to one account and may not
          be shared or resold.
        </li>
      </ul>

      <h2>3. How the contract is concluded</h2>
      <ol>
        <li>You choose a plan on the plan page in your account settings.</li>
        <li>
          You are taken to the payment page of our payment service provider, Stripe. It shows the
          plan, the price and the billing period. You can check and correct your details there, or
          leave the page without ordering.
        </li>
        <li>
          By confirming the payment on that page you place a binding order for the plan with an
          obligation to pay.
        </li>
        <li>
          The contract is concluded when we activate the plan in your account, which normally
          happens within a few seconds. Your receipt is then available under &quot;Manage
          billing&quot; in your account settings.
        </li>
      </ol>
      <p>
        The contract is concluded in English. We do not keep a separate copy of the contract text
        for you. You can open these terms at any time on this page and save or print them; your
        plan, its renewal date and your invoices are available in your account settings.
      </p>

      <h2>4. Prices and payment</h2>
      <ul>
        <li>
          <strong>Price.</strong> Prices are stated in {currency} per month. The total amount
          shown on the payment page before you confirm, including any taxes shown there, is the
          price of the first billing period.
        </li>
        <li>
          <strong>Billing in advance.</strong> The price is due at the start of each billing
          period of one month.
        </li>
        <li>
          <strong>Payment methods.</strong> You can pay with the methods offered on the payment
          page. Payments are processed by Stripe; we do not receive or store your full card
          details. How payment data is handled is described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </li>
        <li>
          <strong>Authorisation.</strong> You authorise us to charge the price of your plan to the
          payment method you provided at the start of every billing period until the subscription
          ends.
        </li>
        <li>
          <strong>Invoices.</strong> Receipts and invoices are available under &quot;Manage
          billing&quot; in your account settings.
        </li>
      </ul>

      <h2>5. Term and automatic renewal</h2>
      <p>
        The subscription starts when the plan is activated and runs for one month. It renews
        automatically for one further month at a time, at the price of your plan, until you or we
        cancel it. The date of the next renewal is shown on the plan page in your account settings.
      </p>

      <h2>6. Cancelling</h2>
      <ul>
        <li>
          <strong>By you.</strong> You can cancel at any time, without giving a reason, on the plan
          page in your account settings (&quot;Cancel plan&quot;). You can also cancel by writing
          to <ContactEmail email={legal.contactEmail} />.
        </li>
        <li>
          <strong>Effect.</strong> The cancellation takes effect at the end of the billing period
          you have already paid for. Until then you keep the paid plan; afterwards your account
          continues on the free plan and you are not charged again. Your conversations are kept.
        </li>
        <li>
          <strong>Changing your mind.</strong> Until the end of that period you can take the
          cancellation back on the plan page.
        </li>
        <li>
          <strong>Deleting your account.</strong> If you delete your account, the subscription
          ends immediately and no further payments are taken.
        </li>
        <li>
          <strong>By us.</strong> We can cancel a subscription with effect from the end of the
          current billing period. The right of both sides to end the contract without notice for
          good cause remains unaffected. A serious or repeated violation of the{" "}
          <Link href="/acceptable-use">Acceptable Use Policy</Link> is such a cause for us.
        </li>
      </ul>

      <h2>7. Changing plans</h2>
      <p>
        You can switch to another paid plan at any time. The new plan starts as soon as the payment
        for it is confirmed, with a new billing period. The previous subscription ends at that
        moment, and the unused part of the period you paid for is credited to your billing account
        and set off against later payments.
      </p>

      <h2>8. If a payment fails</h2>
      <p>
        If a payment cannot be collected, it is attempted again. We will ask you to update your
        payment method. If payment is still not made after the repeated attempts, the paid plan
        ends and your account continues on the free plan.
      </p>

      <h2>9. Changes to prices and limits</h2>
      <p>
        We may change the price or the limits of a plan for future billing periods. We will inform
        you by email or in the service at least 14 days before a change takes effect that raises
        the price or lowers the limits of your plan. The change applies from your next billing
        period after that notice at the earliest. You can cancel before it takes effect; if you do
        not, the subscription continues on the new conditions. Changes in your favour can take
        effect immediately.
      </p>

      <h2>10. Right of withdrawal for consumers</h2>
      <p>
        If you buy a paid plan as a consumer, meaning for purposes that are mainly outside your
        trade, business or profession, and you live in the European Union, the European Economic
        Area or the United Kingdom, you have a statutory right of withdrawal. Consumers in other
        countries have the rights that the law of their country gives them.
      </p>
      <h3>Information on the right of withdrawal</h3>
      <p>
        You have the right to withdraw from this contract within 14 days without giving any reason.
        The withdrawal period expires 14 days after the day on which the contract was concluded.
      </p>
      <p>
        To exercise the right of withdrawal, you must inform us ({operator}; our address is in the{" "}
        <Link href="/imprint">Legal Notice</Link>; email:{" "}
        <ContactEmail email={legal.contactEmail} />) of your decision to withdraw from this
        contract by a clear statement, for example a letter sent by post or an email. You may use
        the model withdrawal form below, but it is not obligatory. To meet the deadline, it is
        sufficient that you send your statement before the withdrawal period has expired.
      </p>
      <h3>Effects of withdrawal</h3>
      <p>
        If you withdraw from this contract, we will reimburse all payments received from you
        without undue delay and in any event no later than 14 days from the day on which we are
        informed of your decision to withdraw. We will use the same means of payment that you used
        for the original transaction, unless you have expressly agreed otherwise; you will not
        incur any fees as a result of the reimbursement.
      </p>
      <p>
        If you asked for the service to begin during the withdrawal period, you pay us an amount
        that is in proportion to what was provided until you told us of your withdrawal, compared
        with the full contract. When you order, you ask us to make the paid plan available
        immediately; the proportionate amount is therefore calculated from the days on which the
        plan was available to you.
      </p>
      <h3>Model withdrawal form</h3>
      <p>(Complete and return this form only if you wish to withdraw from the contract.)</p>
      <ul>
        <li>
          To {operator}, at the address given in the Legal Notice
          {legal.contactEmail ? `, email: ${legal.contactEmail}` : ""}:
        </li>
        <li>
          I hereby give notice that I withdraw from my contract for the provision of the following
          service: paid plan on {siteName}
        </li>
        <li>Ordered on:</li>
        <li>Name of the consumer:</li>
        <li>Email address of the {siteName} account:</li>
        <li>Address of the consumer:</li>
        <li>Signature of the consumer (only if this form is sent on paper):</li>
        <li>Date:</li>
      </ul>

      <h2>11. Refunds</h2>
      <p>
        Apart from the right of withdrawal and your statutory rights, payments for a billing period
        that has already started are not refunded when you cancel. If we end a paid plan for a
        reason you are not responsible for, or discontinue the service, we refund the part of your
        last payment that covers the unused time.
      </p>

      <h2>12. Availability and your statutory rights</h2>
      <p>
        We aim to keep the service available but cannot promise uninterrupted operation; short
        interruptions for maintenance and updates are part of the service. If the service is
        unavailable to you for a substantial part of a billing period for reasons within our
        responsibility, write to us and we will compensate the lost time appropriately. Your
        statutory rights in the event of defects in a digital service remain unaffected. The
        liability rules of the <Link href="/terms">Terms of Use</Link> apply.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        The provisions on governing law and disputes in the{" "}
        <Link href="/terms">Terms of Use</Link> apply to these Subscription Terms as well. If you
        are a consumer, you keep the protection of the mandatory provisions of the law of the
        country in which you habitually reside.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about your plan, a payment or these terms? Write to{" "}
        <ContactEmail email={legal.contactEmail} />.
      </p>
    </LegalPage>
  );
}
