import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  cart: [],
  prescriptionId: '',
  paymentType: 'cash',

  setPrescriptionId: (id) => set({ prescriptionId: id }),
  setPaymentType: (type) => set({ paymentType: type }),

  addToCart: (product) => set((state) => {
    const existing = state.cart.find((i) => i.product_id === product.product_id);
    if (existing) {
      return {
        cart: state.cart.map((item) =>
          item.product_id === product.product_id
            ? { ...item, qty: item.qty + 1, subtotal: (item.qty + 1) * parseFloat(product.selling_price) }
            : item
        )
      };
    }
    return {
      cart: [...state.cart, { ...product, qty: 1, subtotal: parseFloat(product.selling_price) }]
    };
  }),

  updateQty: (productId, delta) => set((state) => ({
    cart: state.cart.map((item) => {
      if (item.product_id === productId) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty, subtotal: newQty * parseFloat(item.selling_price) };
      }
      return item;
    })
  })),

  removeFromCart: (productId) => set((state) => ({
    cart: state.cart.filter((i) => i.product_id !== productId)
  })),

  clearCart: () => set({ cart: [], prescriptionId: '' }),

  getSubtotal: () => get().cart.reduce((sum, item) => sum + item.subtotal, 0),
  getVat: () => get().getSubtotal() * 0.16,
  getGrandTotal: () => get().getSubtotal() * 1.16
}));
