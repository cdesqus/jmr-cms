import { CustomerAuthError } from "../services/customer-auth";
import { hasStorefrontSecret } from "./storefront-secret.cjs";

const body = (ctx: any) => ctx.request.body ?? {};
const stringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const authService = () => strapi.service("api::customer-auth.customer-auth");

const respondWithError = (ctx: any, error: unknown) => {
  if (error instanceof CustomerAuthError) {
    ctx.status =
      error.code === "duplicate"
        ? 409
        : error.code === "invalid_credentials"
          ? 401
          : 400;
    ctx.body = {
      error:
        error.code === "invalid_credentials"
          ? "Invalid email or password."
          : error.message,
    };
    return;
  }
  throw error;
};

export default {
  async register(ctx: any) {
    const input = body(ctx);
    const name = stringValue(input.name);
    const email = stringValue(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    if (!name || !email || !password) {
      ctx.status = 400;
      ctx.body = { error: "Name, email, and password are required." };
      return;
    }
    if (password.length < 10) {
      ctx.status = 400;
      ctx.body = { error: "Password must be at least 10 characters." };
      return;
    }
    if (!isEmail(email)) {
      ctx.status = 400;
      ctx.body = { error: "A valid email is required." };
      return;
    }
    try {
      const customer = await authService().register({ name, email, password });
      if (process.env.NODE_ENV === "production") {
        const { verificationToken: _token, ...safe } = customer;
        ctx.body = safe;
      } else {
        ctx.body = customer;
      }
    } catch (error) {
      respondWithError(ctx, error);
    }
  },

  async verifyEmail(ctx: any) {
    const token = stringValue(body(ctx).token);
    if (!token) {
      ctx.status = 400;
      ctx.body = { error: "Verification token is required." };
      return;
    }
    try {
      ctx.body = await authService().verifyEmail(token);
    } catch (error) {
      respondWithError(ctx, error);
    }
  },

  async login(ctx: any) {
    const input = body(ctx);
    const email = stringValue(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    if (!email || !password) {
      ctx.status = 401;
      ctx.body = { error: "Invalid email or password." };
      return;
    }
    try {
      ctx.body = await authService().authenticate(email, password);
    } catch (error) {
      respondWithError(ctx, error);
    }
  },

  async forgotPassword(ctx: any) {
    const email = stringValue(body(ctx).email);
    if (!email) {
      ctx.status = 400;
      ctx.body = { error: "Email is required." };
      return;
    }
    ctx.body = await authService().requestPasswordReset(email);
  },

  async resetPassword(ctx: any) {
    const input = body(ctx);
    const token = stringValue(input.token);
    const password = typeof input.password === "string" ? input.password : "";
    if (!token || !password) {
      ctx.status = 400;
      ctx.body = { error: "Reset token and password are required." };
      return;
    }
    if (password.length < 10) {
      ctx.status = 400;
      ctx.body = { error: "Password must be at least 10 characters." };
      return;
    }
    try {
      ctx.body = await authService().resetPassword(token, password);
    } catch (error) {
      respondWithError(ctx, error);
    }
  },

  async session(ctx: any) {
    const configuredSecret = process.env.JAMORA_STOREFRONT_API_SECRET;
    if (!hasStorefrontSecret(
      ctx.get("x-jamora-storefront-secret"),
      configuredSecret,
    )) {
      ctx.status = 401;
      ctx.body = { error: "Storefront API secret required." };
      return;
    }
    const input = body(ctx);
    const documentId = stringValue(input.documentId);
    const sessionVersion = input.sessionVersion;
    if (!documentId || !Number.isInteger(sessionVersion)) {
      ctx.status = 400;
      ctx.body = { error: "Document ID and session version are required." };
      return;
    }
    const customer = await authService().findActiveSessionCustomer(
      documentId,
      sessionVersion,
    );
    if (!customer) {
      ctx.status = 401;
      ctx.body = { error: "Invalid session." };
      return;
    }
    ctx.body = customer;
  },
};
