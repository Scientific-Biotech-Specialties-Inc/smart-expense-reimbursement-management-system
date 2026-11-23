// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";

describe("BaseUtilityToolbar — Sort By functionality", () => {
  const sampleSortOptions = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "name-asc", label: "Name: A to Z" },
    { value: "name-desc", label: "Name: Z to A" },
    { value: "price-desc", label: "Price: High to Low" },
    { value: "price-asc", label: "Price: Low to High" },
    { value: "category-asc", label: "Category: A to Z" },
    { value: "status-asc", label: "Status: A to Z" },
  ];

  it("does not render the Sort By button when sortOptions is empty", () => {
    const wrapper = mount(BaseUtilityToolbar, {
      props: {
        statuses: ["All", "Pending"],
        sortOptions: [],
      },
    });

    const buttons = wrapper.findAll("button");
    const sortButton = buttons.find((btn) => btn.text().includes("Sort"));
    expect(sortButton).toBeUndefined();
  });

  it("renders the Sort By button when sortOptions are provided", () => {
    const wrapper = mount(BaseUtilityToolbar, {
      props: {
        statuses: ["All", "Pending"],
        sortOptions: sampleSortOptions,
        sortValue: "newest",
      },
    });

    const buttons = wrapper.findAll("button");
    const sortButton = buttons.find((btn) => btn.text().includes("Sort"));
    expect(sortButton).toBeDefined();
    expect(sortButton.text()).toBe("Sort by");
  });

  it("dynamically shows 'Sort: [Label]' when non-default sort is active", () => {
    const wrapper = mount(BaseUtilityToolbar, {
      props: {
        statuses: ["All", "Pending"],
        sortOptions: sampleSortOptions,
        sortValue: "price-desc",
      },
    });

    const buttons = wrapper.findAll("button");
    const sortButton = buttons.find((btn) => btn.text().includes("Sort"));
    expect(sortButton.text()).toBe("Sort: Price: High to Low");
  });

  it("toggles the sort dropdown and emits update:sortValue when an option is clicked", async () => {
    const wrapper = mount(BaseUtilityToolbar, {
      props: {
        statuses: ["All", "Pending"],
        sortOptions: sampleSortOptions,
        sortValue: "newest",
      },
    });

    // Find sort button
    const buttons = wrapper.findAll("button");
    const sortButton = buttons.find((btn) => btn.text().includes("Sort"));
    
    // Open dropdown
    await sortButton.trigger("click");

    // Check options rendered
    const optionButtons = wrapper.findAll("div.origin-top-left button");
    expect(optionButtons.length).toBe(sampleSortOptions.length);

    // Click 'Name: A to Z'
    const nameAscOption = optionButtons.find((btn) => btn.text().includes("Name: A to Z"));
    expect(nameAscOption).toBeDefined();
    await nameAscOption.trigger("click");

    expect(wrapper.emitted("update:sortValue")).toBeTruthy();
    expect(wrapper.emitted("update:sortValue")[0]).toEqual(["name-asc"]);
  });

  it("renders extra-filters slot inside the filter popover", async () => {
    const wrapper = mount(BaseUtilityToolbar, {
      slots: {
        "extra-filters": '<div data-testid="custom-filter">Custom Filter Content</div>',
      },
    });

    const filterButton = wrapper.findAll("button").find((btn) => btn.text().includes("Filters"));
    expect(filterButton).toBeDefined();

    await filterButton.trigger("click");
    expect(wrapper.find('[data-testid="custom-filter"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Custom Filter Content");
  });
});

