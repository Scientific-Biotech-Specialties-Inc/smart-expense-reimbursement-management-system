// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ProfileView from "./ProfileView.vue";
import { useAuthStore } from "@/stores/auth";

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useRoute: () => ({ path: "/profile", query: {} }),
}));

const mockAddToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

describe("ProfileView.vue (G2-104 to G2-110)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:test-preview-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("renders Employee profile details accurately with read-only fields and 'Not set' fallbacks (G2-104)", async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      auth_id: 101,
      employee_id: "EMP-0101",
      name: "Sara Smith",
      email: "sara.smith@sbsi.com",
      role: "employee",
      department: "Operations",
      grade: null,
      created_at: "2026-01-01T08:00:00Z",
      is_admin: false,
      contact_number: null,
    };

    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    expect(wrapper.text()).toContain("Sara Smith");
    expect(wrapper.text()).toContain("sara.smith@sbsi.com");
    expect(wrapper.text()).toContain("EMP-0101");
    expect(wrapper.text()).toContain("Operations");
    expect(wrapper.text()).toContain("Jan 1, 2026");
    // Missing fields render 'Not set'
    expect(wrapper.text()).toContain("Not set");
    // Admin notice should NOT be visible
    expect(wrapper.find('[data-testid="admin-approval-notice"]').exists()).toBe(false);
  });

  it("renders Admin profile with role displayed as Admin and includes compliance note (G2-105)", async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 2,
      auth_id: 102,
      employee_id: "EMP-0102",
      name: "Admin User",
      email: "admin@sbsi.com",
      role: "admin",
      department: "Accounting",
      grade: "L5",
      is_admin: true,
      created_at: "2026-02-15T08:00:00Z",
    };

    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    expect(wrapper.text()).toContain("Admin User");
    expect(wrapper.text()).toContain("Accounting");
    expect(wrapper.find('[data-testid="admin-approval-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-approval-notice"]').text()).toContain("Approved by");
    expect(wrapper.find('[data-testid="admin-approval-notice"]').text()).toContain("Granted by");
  });

  it("switches to edit mode, validates inputs, and updates profile details (G2-106)", async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      name: "Sara Smith",
      first_name: "Sara",
      last_name: "Smith",
      email: "sara.smith@sbsi.com",
      role: "employee",
      department: "Operations",
      contact_number: "+63 917 123 4567",
      is_admin: false,
    };

    auth.updateProfile = vi.fn().mockResolvedValue({
      message: "Profile details updated successfully.",
      user: {
        ...auth.user,
        name: "Sara Jane Smith",
        first_name: "Sara Jane",
        last_name: "Smith",
        contact_number: "+63 917 999 8888",
      },
    });

    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Click Edit Profile CTA
    await wrapper.find('[data-testid="edit-profile-cta-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="input-first-name"]').exists()).toBe(true);

    // Validation test: clear first name and trigger save
    await wrapper.find('[data-testid="input-first-name"]').setValue("");
    await wrapper.find('[data-testid="save-profile-btn"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("First name is required");
    expect(auth.updateProfile).not.toHaveBeenCalled();

    // Valid update
    await wrapper.find('[data-testid="input-first-name"]').setValue("Sara Jane");
    await wrapper.find('[data-testid="input-contact-number"]').setValue("+63 917 999 8888");
    await wrapper.find('[data-testid="save-profile-btn"]').trigger("click");
    await flushPromises();

    expect(auth.updateProfile).toHaveBeenCalledWith({
      first_name: "Sara Jane",
      middle_name: null,
      last_name: "Smith",
      contact_number: "+63 917 999 8888",
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("handles profile photo selection, preview, upload and removal (G2-107)", async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      name: "Sara Smith",
      avatar_url: null,
    };

    auth.uploadProfilePhoto = vi.fn().mockResolvedValue({
      user: { ...auth.user, avatar_url: "https://supabase/avatars/new.png" },
    });
    auth.removeProfilePhoto = vi.fn().mockResolvedValue({
      user: { ...auth.user, avatar_url: null },
    });
    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Select file
    const fileInput = wrapper.find('input[type="file"]');
    const validFile = new File(["dummy content"], "avatar.png", { type: "image/png" });
    Object.defineProperty(fileInput.element, "files", {
      value: [validFile],
    });
    await fileInput.trigger("change");

    expect(wrapper.find('[data-testid="save-photo-btn"]').exists()).toBe(true);

    // Save photo
    await wrapper.find('[data-testid="save-photo-btn"]').trigger("click");
    await flushPromises();

    expect(auth.uploadProfilePhoto).toHaveBeenCalledWith(validFile);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );

    // Now with existing avatar, test remove photo
    auth.user.avatar_url = "https://supabase/avatars/new.png";
    await wrapper.vm.$nextTick();

    const removeBtn = wrapper.find('[data-testid="remove-photo-btn"]');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger("click");
    await flushPromises();

    expect(auth.removeProfilePhoto).toHaveBeenCalled();
  });

  it("switches to Security tab and validates password checklist before changing password (G2-108)", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Sara Smith" };
    auth.changePassword = vi.fn().mockResolvedValue({ message: "Password changed." });
    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Switch to Security tab
    await wrapper.find('[data-testid="tab-security"]').trigger("click");
    expect(wrapper.find('[data-testid="input-current-password"]').exists()).toBe(true);

    // Submit button should be disabled when requirements are not satisfied
    const submitBtn = wrapper.find('[data-testid="submit-password-btn"]');
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Fill valid new password meeting all criteria
    await wrapper.find('[data-testid="input-current-password"]').setValue("CurrentPassword123!");
    await wrapper.find('[data-testid="input-new-password"]').setValue("NewPassword2026!#");
    await wrapper.find('[data-testid="input-confirm-password"]').setValue("NewPassword2026!#");
    await wrapper.vm.$nextTick();

    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await submitBtn.trigger("click");
    await flushPromises();

    expect(auth.changePassword).toHaveBeenCalledWith({
      current_password: "CurrentPassword123!",
      new_password: "NewPassword2026!#",
      new_password_confirmation: "NewPassword2026!#",
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("handles digital signature save and removal (G2-109)", async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      name: "Sara Smith",
      signature: null,
      has_signature: false,
    };

    auth.saveSignature = vi.fn().mockResolvedValue({
      user: { ...auth.user, signature: "data:image/png;base64,sample", has_signature: true },
    });
    auth.removeSignature = vi.fn().mockResolvedValue({
      user: { ...auth.user, signature: null, has_signature: false },
    });
    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Check save signature button initially disabled with no signature
    expect(wrapper.find('[data-testid="save-signature-btn"]').exists()).toBe(true);

    // Set signature and save
    wrapper.vm.newSignature = "data:image/png;base64,sample";
    await wrapper.vm.$nextTick();

    await wrapper.find('[data-testid="save-signature-btn"]').trigger("click");
    await flushPromises();

    expect(auth.saveSignature).toHaveBeenCalledWith("data:image/png;base64,sample");
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );

    // With saved signature present
    auth.user.signature = "data:image/png;base64,sample";
    auth.user.has_signature = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="remove-signature-btn"]').exists()).toBe(true);
    await wrapper.find('[data-testid="remove-signature-btn"]').trigger("click");
    await flushPromises();

    expect(auth.removeSignature).toHaveBeenCalled();
  });

  it("switches to Activity Log tab and displays user logins and account changes (G2-110)", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Sara Smith", last_login_at: "2026-11-12T10:00:00Z" };

    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: "2026-11-12T10:00:00Z",
      recent_logins: [
        { id: 10, action_type: "USER_LOGIN", label: "Signed In", created_at: "2026-11-12T10:00:00Z" },
      ],
      account_changes: [
        {
          id: 11,
          action_type: "PROFILE_UPDATED",
          label: "Profile Details Updated",
          created_at: "2026-11-12T09:30:00Z",
          changes: [{ field: "Contact Number", before: "+63 917 111 1111", after: "+63 917 222 2222" }],
        },
      ],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Switch to Activity tab
    await wrapper.find('[data-testid="tab-activity"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Login History & Access");
    expect(wrapper.text()).toContain("Recent Logins");
    expect(wrapper.text()).toContain("Signed In");
    expect(wrapper.text()).toContain("Recent Account Changes");
    expect(wrapper.text()).toContain("Profile Details Updated");
    expect(wrapper.text()).toContain("+63 917 222 2222");
  });

  it("renders a Back button in place of breadcrumbs and navigates back or to /dashboard", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Sara Smith" };
    auth.fetchProfileActivity = vi.fn().mockResolvedValue({
      last_login_at: null,
      recent_logins: [],
      account_changes: [],
    });

    const wrapper = mount(ProfileView);
    await flushPromises();

    const backBtn = wrapper.find('[data-testid="profile-back-btn"]');
    expect(backBtn.exists()).toBe(true);
    expect(backBtn.text()).toContain("Back");

    // Click back button when window.history.state has back
    window.history.replaceState({ back: "/dashboard" }, "");
    await backBtn.trigger("click");
    expect(mockBack).toHaveBeenCalled();

    // Click back button when window.history.state has no back
    window.history.replaceState(null, "");
    await backBtn.trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});
