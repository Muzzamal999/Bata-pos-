import { ProductGrid } from '../components/product-grid';
import { CartPanel } from '../components/cart-panel';
import styles from './sales.module.css';

export default function SalesPage() {
  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <ProductGrid />
      </div>
      <div className={styles.right}>
        <CartPanel />
      </div>
    </div>
  );
}
