export function passwordResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #18181b;">Parolunuzu sıfırlayın</h2>
      <p style="color: #3f3f46;">
        FinanceOS hesabınız üçün parol sıfırlama tələbi aldıq. Aşağıdakı düyməyə klikləyərək yeni parol təyin edə bilərsiniz.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background: #18181b; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Parolu sıfırla
        </a>
      </p>
      <p style="color: #71717a; font-size: 13px;">
        Bu link 1 saat ərzində etibarlıdır. Əgər bu tələbi siz etməmisinizsə, bu email-i nəzərə almaya bilərsiniz —
        hesabınızda heç bir dəyişiklik edilməyəcək.
      </p>
    </div>
  `;
}
