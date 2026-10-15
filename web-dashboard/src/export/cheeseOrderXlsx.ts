import { fillCheeseOrderTemplate, type CheeseOrderRow, type CheeseOrderShop } from './cheeseOrderLayout';
import {
  CHEESE_TEMPLATE_COLUMN_WIDTHS,
  CHEESE_TEMPLATE_MERGES,
  CHEESE_TEMPLATE_ROW_HEIGHTS,
  CHEESE_TEMPLATE_STYLE_GRID,
  CHEESE_TEMPLATE_STYLES,
  CHEESE_TEMPLATE_VALUES,
} from './cheeseOrderTemplate';
import { makeTemplateXlsxBlob, xlsxColumnName, type XlsxTemplateCell } from './xlsx';

export const makeCheeseOrderXlsx = (params: {
  rows: CheeseOrderRow[];
  shops: CheeseOrderShop[];
  exportDate: string;
  orderDate: string;
}) => {
  const { values, unplacedShops, unplacedProducts } = fillCheeseOrderTemplate(params);
  const cells: XlsxTemplateCell[][] = CHEESE_TEMPLATE_STYLE_GRID.map((styleRow, rowIndex) =>
    [...styleRow].map((styleChar, colIndex) => {
      const ref = `${xlsxColumnName(colIndex + 1)}${rowIndex + 1}`;
      return { value: values[ref] ?? CHEESE_TEMPLATE_VALUES[ref] ?? '', style: Number.parseInt(styleChar, 36) };
    }),
  );
  const blob = makeTemplateXlsxBlob({
    sheetName: 'Заявка',
    styles: CHEESE_TEMPLATE_STYLES,
    cells,
    merges: CHEESE_TEMPLATE_MERGES,
    columnWidths: CHEESE_TEMPLATE_COLUMN_WIDTHS,
    rowHeights: CHEESE_TEMPLATE_ROW_HEIGHTS,
  });
  return { blob, unplacedShops, unplacedProducts };
};
