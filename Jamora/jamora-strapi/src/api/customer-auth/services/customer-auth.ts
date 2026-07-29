import {
  hashOpaqueToken,
  hashPassword,
  issueOpaqueToken,
  verifyPassword,
} from "./customer-credentials.cjs";
import {
  runRecoveryPrivacyWork,
} from "./customer-recovery-privacy.cjs";
import { createBoundedWork } from "./bounded-work.cjs";

const CUSTOMER_UID = "api::customer-account.customer-account";
const DUMMY_PASSWORD_HASH =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA$Kj71E_wcj1YM_Y-rzqkPHzClVqy9I-k_sN5f-rD7ai1HKxo-pFz0WBWsK8pLijOWc4C2VEaoIdWqjakIutmPEA";
const CUSTOMER_FIELDS = [
  "documentId",
  "name",
  "email",
  "emailVerifiedAt",
  "active",
  "sessionVersion",
] as const;
const passwordWork = createBoundedWork(
  Number(process.env.CUSTOMER_AUTH_HASH_CONCURRENCY ?? "4"),
  Number(process.env.CUSTOMER_AUTH_HASH_QUEUE_LIMIT ?? "32"),
);

type SafeCustomer = {
  documentId: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  active: boolean;
  sessionVersion: number;
};

export class CustomerAuthError extends Error {
  readonly code: "duplicate" | "invalid_credentials" | "invalid_token";

  constructor(
    code: "duplicate" | "invalid_credentials" | "invalid_token",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const expiresAt = (milliseconds: number) =>
  new Date(Date.now() + milliseconds).toISOString();

const safeCustomer = (customer: any): SafeCustomer => ({
  documentId: customer.documentId,
  name: customer.name,
  email: customer.email,
  emailVerifiedAt: customer.emailVerifiedAt ?? null,
  active: customer.active,
  sessionVersion: customer.sessionVersion,
});

export default ({ strapi }: { strapi: any }) => {
  const customers = () => strapi.documents(CUSTOMER_UID);
  const findBy = async (filters: Record<string, unknown>) => {
    const records = await customers().findMany({ filters, limit: 1 });
    return records[0] ?? null;
  };

  return {
    async register(input: {
      name: string;
      email: string;
      password: string;
    }): Promise<SafeCustomer & { verificationToken: string }> {
      const email = normalizeEmail(input.email);
      if (await findBy({ email: { $eq: email } })) {
        throw new CustomerAuthError("duplicate", "An account already exists for this email.");
      }

      const verificationToken = issueOpaqueToken();
      let customer;
      try {
        customer = await customers().create({
          data: {
            name: input.name.trim(),
            email,
            passwordHash: await passwordWork(() => hashPassword(input.password)),
            active: true,
            sessionVersion: 0,
            verificationTokenHash: hashOpaqueToken(verificationToken),
            verificationExpiresAt: expiresAt(24 * 60 * 60 * 1000),
          },
          fields: [...CUSTOMER_FIELDS],
        });
      } catch (error: any) {
        if (
          error?.code === "23505" ||
          /unique|duplicate/i.test(String(error?.message ?? ""))
        ) {
          throw new CustomerAuthError("duplicate", "An account already exists for this email.");
        }
        throw error;
      }
      return { ...safeCustomer(customer), verificationToken };
    },

    async verifyEmail(token: string): Promise<SafeCustomer> {
      const customer = await findBy({
        verificationTokenHash: { $eq: hashOpaqueToken(token) },
        verificationExpiresAt: { $gt: new Date().toISOString() },
      });
      if (!customer) {
        throw new CustomerAuthError("invalid_token", "Invalid or expired verification token.");
      }
      const consumed = await strapi.db.query(CUSTOMER_UID).updateMany({
        where: {
          documentId: customer.documentId,
          verificationTokenHash: hashOpaqueToken(token),
          verificationExpiresAt: { $gt: new Date().toISOString() },
        },
        data: {
          emailVerifiedAt: new Date().toISOString(),
          verificationTokenHash: null,
          verificationExpiresAt: null,
        },
      });
      if (consumed.count !== 1) {
        throw new CustomerAuthError("invalid_token", "Invalid or expired verification token.");
      }
      return safeCustomer(await customers().findOne({
        documentId: customer.documentId,
        fields: [...CUSTOMER_FIELDS],
      }));
    },

    async authenticate(
      emailInput: string,
      password: string,
    ): Promise<SafeCustomer & { sessionVersion: number }> {
      const customer = await findBy({ email: { $eq: normalizeEmail(emailInput) } });
      const usable = customer?.active && customer?.emailVerifiedAt;
      const passwordMatches = await passwordWork(() => verifyPassword(
        password,
        usable ? customer.passwordHash : DUMMY_PASSWORD_HASH,
      ));
      if (!usable || !passwordMatches) {
        throw new CustomerAuthError("invalid_credentials", "Invalid email or password.");
      }
      return safeCustomer(customer);
    },

    async requestPasswordReset(
      emailInput: string,
    ): Promise<{ accepted: true; resetToken?: string }> {
      return runRecoveryPrivacyWork(async ({ token, tokenHash }) => {
        const customer = await findBy({ email: { $eq: normalizeEmail(emailInput) } });
        if (!customer || !customer.active) return { accepted: true };

        await customers().update({
          documentId: customer.documentId,
          data: {
            resetTokenHash: tokenHash,
            resetExpiresAt: expiresAt(60 * 60 * 1000),
          },
        });
        return process.env.NODE_ENV === "production"
          ? { accepted: true }
          : { accepted: true, resetToken: token };
      });
    },

    async resetPassword(token: string, password: string): Promise<SafeCustomer> {
      const customer = await findBy({
        resetTokenHash: { $eq: hashOpaqueToken(token) },
        resetExpiresAt: { $gt: new Date().toISOString() },
      });
      if (!customer) {
        throw new CustomerAuthError("invalid_token", "Invalid or expired reset token.");
      }
      const consumed = await strapi.db.query(CUSTOMER_UID).updateMany({
        where: {
          documentId: customer.documentId,
          resetTokenHash: hashOpaqueToken(token),
          resetExpiresAt: { $gt: new Date().toISOString() },
        },
        data: {
          passwordHash: await passwordWork(() => hashPassword(password)),
          resetTokenHash: null,
          resetExpiresAt: null,
          sessionVersion: customer.sessionVersion + 1,
        },
      });
      if (consumed.count !== 1) {
        throw new CustomerAuthError("invalid_token", "Invalid or expired reset token.");
      }
      return safeCustomer(await customers().findOne({
        documentId: customer.documentId,
        fields: [...CUSTOMER_FIELDS],
      }));
    },

    async findActiveSessionCustomer(
      documentId: string,
      sessionVersion: number,
    ): Promise<SafeCustomer | null> {
      const customer = await customers().findOne({
        documentId,
        fields: [...CUSTOMER_FIELDS],
      });
      if (
        !customer ||
        !customer.active ||
        !customer.emailVerifiedAt ||
        customer.sessionVersion !== sessionVersion
      ) {
        return null;
      }
      return safeCustomer(customer);
    },
  };
};
