import { Link } from "react-router-dom";
import { LegalPage, LegalSection, LegalList } from "@/components/layout/LegalPage";

/**
 * Privacy Policy page (route: /privacy — intentionally PUBLIC).
 *
 * Static legal content via the shared LegalPage layout. Public for the same
 * reason as Terms: platform app-review tools fetch it while signed out.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="27 July 2026"
      intro="This policy explains what LinguaGuard collects, why, how long we keep it, and who we share it with. LinguaGuard is a content moderation service, so by design it processes messages and posts from the platform accounts you choose to connect."
    >
      <LegalSection heading="1. What we collect">
        <p>
          <strong className="text-foreground">Account information.</strong> Your name, email
          address, and optionally a phone number. Passwords are never stored — only a bcrypt hash.
        </p>
        <p>
          <strong className="text-foreground">Connected platform data.</strong> When you connect an
          account we store the access tokens that platform issues, plus a display name and handle so
          you can tell connected accounts apart. Tokens are encrypted at rest.
        </p>
        <p>
          <strong className="text-foreground">Moderated content.</strong> When content is scanned we
          record the message text, sender name, platform, the rule matched, severity, and outcome.
          This is what the Activity Log and Reports pages display.
        </p>
        <p>
          <strong className="text-foreground">Security and session data.</strong> Active sessions
          with an approximate device description and IP address, plus API keys you generate (stored
          only as a hash).
        </p>
      </LegalSection>

      <LegalSection heading="2. Why we process it">
        <LegalList
          items={[
            "To operate the filtering engine and show you its results.",
            "To authenticate you and keep your account secure.",
            "To send the alerts and weekly digests you have enabled.",
            "To enforce plan limits and process subscription payments.",
            "To diagnose faults and keep the service running.",
          ]}
        />
        <p>
          We do not sell your data, and we do not use your moderated content to train machine
          learning models.
        </p>
      </LegalSection>

      <LegalSection heading="3. Third-party platforms">
        <p>
          We only access a connected platform using the permissions you granted during
          authorisation, and only to read content for moderation. We do not post, message, or act on
          your behalf. Revoking a connection from the Connections page deletes our stored tokens for
          it.
        </p>
      </LegalSection>

      <LegalSection heading="4. Who we share it with">
        <p>We share data only with the providers needed to deliver the service:</p>
        <LegalList
          items={[
            "Email delivery — for password resets, alerts, and digests.",
            "SMS delivery — for verification codes and critical alerts, where you have supplied a phone number.",
            "Safaricom M-Pesa — to process subscription payments. We never see or store your PIN.",
            "The platforms you connect — necessarily, to read the content being moderated.",
          ]}
        />
        <p>
          We may also disclose data where legally required, or to protect the rights and safety of
          users and the service.
        </p>
      </LegalSection>

      <LegalSection heading="5. How long we keep it">
        <p>
          Activity records are retained according to your plan: <strong className="text-foreground">7
          days</strong> on Free, <strong className="text-foreground">90 days</strong> on Pro, and{" "}
          <strong className="text-foreground">1 year</strong> on Enterprise. Downgrading shortens
          this window and older records may become inaccessible.
        </p>
        <p>
          Account information is kept while your account exists. Deleting your account removes your
          profile, platform connections, filter rules, activity history, sessions, and API keys.
          Verification and reset codes are short-lived and expire automatically.
        </p>
      </LegalSection>

      <LegalSection heading="6. How we protect it">
        <LegalList
          items={[
            "Passwords hashed with bcrypt; never stored or transmitted in plain text.",
            "Platform access tokens and two-factor secrets encrypted with AES-256-GCM at rest.",
            "API keys stored only as SHA-256 hashes — the full key is shown once, at creation.",
            "Session-level access control, so an individual device can be signed out without affecting others.",
            "Optional two-factor authentication, and rate limiting on authentication endpoints.",
          ]}
        />
        <p>
          No system is perfectly secure, but we work to protect your data using measures appropriate
          to its sensitivity.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          You can access and update your profile, review and revoke active sessions and API keys,
          disconnect any platform, adjust notification preferences, and request account deletion —
          all from within the application. Depending on your jurisdiction you may also have rights to
          data portability or to object to certain processing. Contact us to exercise these.
        </p>
      </LegalSection>

      <LegalSection heading="8. Browser storage">
        <p>
          We use browser local storage for your session token, theme preference, and platform display
          settings. These are required for the application to function and are not used for
          advertising or cross-site tracking.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes">
        <p>
          We may update this policy. Material changes will be signalled by updating the date at the
          top of this page. Your continued use after a change means you accept the revised policy.
          See also our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
