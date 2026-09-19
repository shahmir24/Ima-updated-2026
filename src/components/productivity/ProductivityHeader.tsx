
import React from 'react';
import PageHeader from '@/components/layout/PageHeader';

interface ProductivityHeaderProps {
  /** Must match the page's content width so the title lines up with the grid. */
  width?: string;
}

const ProductivityHeader = ({ width }: ProductivityHeaderProps) => (
  <PageHeader title="Productivity" backPath="/" width={width} />
);

export default ProductivityHeader;
