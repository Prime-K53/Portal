import React from 'react';
import { OrderItem } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ProductListViewProps {
  items: OrderItem[];
}

export const ProductListView: React.FC<ProductListViewProps> = ({ items }) => {
  if (items.length === 0) {
    return <p>No products available.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-start mb-2">
            <div className="text-base font-bold">{item.productName}</div>
            <div className="text-base font-bold">{formatCurrency(item.unitPrice)} / pcs</div>
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500">Min Order: {item.quantity} pcs</div>
            <div className="bg-black text-white px-4 py-1.5 text-xs font-bold">Add to Cart</div>
          </div>
        </div>
      ))}
    </div>
  );
};
