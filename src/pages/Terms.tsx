import { Link } from "react-router-dom";
import { LegalPage, LegalSection, LegalList } from "@/components/layout/LegalPage";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="27 July 2026"
      intro="These terms govern your use of LinguaGuard, a content moderation service that connects to your social, messaging, and AI platform accounts to filter content against rules you define. By creating an account or using the service, you agree to these terms."
    >
      <LegalSection heading="1. The service">
        <p>
          LinguaGuard lets you connect third-party platform accounts, define filter rules, and
          review the results. Content reaching a connected account is evaluated against your
          enabled rules and recorded in your activity log as allowed, flagged, or blocked.
        </p>
        <p>
          LinguaGuard is a moderation aid, not a guarantee. It applies the rules you configure and
          will not catch content those rules do not describe. You remain responsible for moderation
          decisions on your platforms and for complying with each platform's own policies.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts">
        <p>
          You must provide accurate registration details and keep your credentials secure. You are
          responsible for activity under your account. Two-factor authentication is available and
          recommended. Notify us promptly if you believe your account has been compromised.
        </p>
        <p>You must be old enough to form a binding contract in your jurisdiction.</p>
      </LegalSection>

      <LegalSection heading="3. Connected platforms">
        <p>
          Connecting a third-party account authorises LinguaGuard to access that account on your
          behalf, limited to the permissions you grant during authorisation. You may disconnect any
          account at any time from the Connections page, which revokes our stored access for it.
        </p>
        <LegalList
          items={[
            "You must own the accounts you connect, or be authorised to act for them.",
            "Your use of each platform remains governed by that platform's own terms.",
            "Platforms may change or withdraw their APIs, which can interrupt a connection through no fault of ours.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to use LinguaGuard to:</p>
        <LegalList
          items={[
            "Break any applicable law, or any connected platform's terms.",
            "Monitor accounts or conversations you have no right to monitor.",
            "Attempt to breach, overload, probe, or reverse-engineer the service.",
            "Resell or redistribute the service without written permission.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Your content and data">
        <p>
          You retain all rights to your content. You grant us only the limited licence needed to
          operate the service for you — processing content through the filter engine, storing
          activity records, and displaying results back to you.
        </p>
        <p>
          How we handle personal data is described in our{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="6. Plans and payment">
        <p>
          A free tier is available. Paid plans are billed monthly in advance via M-Pesa, in Kenyan
          Shillings, at the prices shown on the Settings page. Upgrades take effect once payment is
          confirmed.
        </p>
        <p>
          Downgrades take effect immediately and may reduce your limits — including how many
          platforms stay connected and how long activity history is retained. Data outside your new
          plan's retention window may become inaccessible. Payments are non-refundable except where
          required by law.
        </p>
      </LegalSection>

      <LegalSection heading="7. Availability">
        <p>
          We aim to keep the service available but do not guarantee uninterrupted operation.
          Maintenance, third-party outages, and provider limits can all affect availability. We may
          change or discontinue features, and will give reasonable notice of material changes where
          we can.
        </p>
      </LegalSection>

      <LegalSection heading="8. Suspension and termination">
        <p>
          You may stop using the service and request account deletion at any time. We may suspend or
          terminate an account that breaches these terms, creates risk for other users, or is
          required to be suspended by law. On termination your access ends and associated data is
          removed, subject to any legal retention obligations.
        </p>
      </LegalSection>

      <LegalSection heading="9. Disclaimers and liability">
        <p>
          The service is provided "as is", without warranties of any kind to the extent permitted by
          law. We do not warrant that filtering will identify all objectionable content or that it
          will never flag acceptable content.
        </p>
        <p>
          To the maximum extent permitted by law, we are not liable for indirect, incidental, or
          consequential losses, or for loss of profits, data, or goodwill. Our total liability for
          any claim is limited to the amount you paid us in the twelve months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to these terms">
        <p>
          We may update these terms. Material changes will be signalled by updating the date at the
          top of this page, and where appropriate by notifying you directly. Continuing to use the
          service after a change means you accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Governing law">
        <p>
          These terms are governed by the laws of Kenya, and the courts of Kenya have exclusive
          jurisdiction over any dispute arising from them.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
