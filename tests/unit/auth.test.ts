import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/lib/auth/totp";
import { can, canAssignRole, isStaffRole, permissionsFor, PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { decrypt, encrypt, signToken, verifyToken } from "@/lib/crypto";

// RFC 6238 / 4226 test secret "12345678901234567890"
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("round-trips base32", () => {
    expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
  });
  it("matches RFC 4226 HOTP vectors", () => {
    expect(hotp(SECRET, 0)).toBe("755224");
    expect(hotp(SECRET, 1)).toBe("287082");
    expect(hotp(SECRET, 9)).toBe("520489");
  });
  it("matches RFC 6238 at T=59s and tolerates one step of drift", () => {
    expect(totp(SECRET, 59_000)).toBe("287082");
    expect(verifyTotp(SECRET, "287082", 59_000)).toBe(true);
    expect(verifyTotp(SECRET, "287082", 89_000)).toBe(true);
    expect(verifyTotp(SECRET, "287082", 200_000)).toBe(false);
    expect(verifyTotp(SECRET, "abc", 59_000)).toBe(false);
  });
});

describe("permissions", () => {
  it("gives owners everything and customers nothing", () => {
    expect(permissionsFor("OWNER")).toHaveLength(PERMISSIONS.length);
    expect(permissionsFor("CUSTOMER")).toHaveLength(0);
    expect(isStaffRole("CUSTOMER")).toBe(false);
  });
  it("limits roles to their job", () => {
    expect(can("DRIVER", "deliveries:drive")).toBe(true);
    expect(can("DRIVER", "orders:view")).toBe(false);
    expect(can("ACCOUNTANT", "finance:view")).toBe(true);
    expect(can("ACCOUNTANT", "products:manage")).toBe(false);
    expect(can("MANAGER", "staff:manage")).toBe(false);
    expect(can("SALES", "pos:use")).toBe(true);
  });
  it("only owners can create owners", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "SALES")).toBe(true);
    expect(canAssignRole("MANAGER", "SALES")).toBe(false);
  });
});

describe("passwords & crypto", () => {
  it("hashes and verifies with scrypt", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
  it("rejects weak passwords", () => {
    expect(passwordProblems("short")).toBeTruthy();
    expect(passwordProblems("password")).toBeTruthy();
    expect(passwordProblems("aaaaaaaaaa")).toBeTruthy();
    expect(passwordProblems("farm-to-table-2026")).toBeNull();
  });
  it("encrypts secrets with authentication", () => {
    const c = encrypt("JBSWY3DPEHPK3PXP");
    expect(decrypt(c)).toBe("JBSWY3DPEHPK3PXP");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });
  it("signs expiring tokens", () => {
    const t = signToken({ uid: "u1" }, 60, "mfa");
    expect(verifyToken<{ uid: string }>(t, "mfa")?.uid).toBe("u1");
    expect(verifyToken(t, "other-purpose")).toBeNull();
    expect(verifyToken(signToken({ uid: "u1" }, -1, "mfa"), "mfa")).toBeNull();
    expect(verifyToken(t.replace(/.$/, "x"), "mfa")).toBeNull();
  });
});
