import {
  BorderStyle,
  ShadingType,
  WidthType,
  AlignmentType,
  type ITableCellOptions,
  type ITableOptions,
  type ITableRowOptions,
  VerticalAlignTable,
  convertMillimetersToTwip,
} from "docx";
import {
  TableRow as MdTableRow,
  IPlugin,
  Optional,
  RootContent,
  PhrasingContent,
  EmptyNode,
} from "@m2d/core";

export type RowProps = Omit<ITableRowOptions, "children">;
export type TableProps = Omit<ITableOptions, "rows">;
export type CellProps = Omit<ITableCellOptions, "children">;

export interface ITableAlignments {
  defaultVerticalAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable];
  defaultHorizontalAlign?: (typeof AlignmentType)[keyof typeof AlignmentType];
  /**
   * Use MDAST data for horizontal aligning columns
   * @default true
   */
  preferMdData?: boolean;
}

interface IDefaultTablePluginProps {
  tableProps: TableProps;
  rowProps: RowProps;
  cellProps: CellProps;
  firstRowProps: RowProps;
  firstRowCellProps: CellProps;
  alignments: ITableAlignments;
}

type ITablePluginProps = Optional<IDefaultTablePluginProps>;

const border = { style: BorderStyle.SINGLE, color: "auto", size: 1 };

/**
 * default table options
 */
export const defaultTableOptions: IDefaultTablePluginProps = {
  tableProps: {
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: {
      top: convertMillimetersToTwip(2),
      right: convertMillimetersToTwip(4),
      bottom: convertMillimetersToTwip(2),
      left: convertMillimetersToTwip(4),
    },
    borders: {
      top: border,
      right: border,
      bottom: border,
      left: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  },
  rowProps: {},
  cellProps: {},
  firstRowProps: { tableHeader: true },
  firstRowCellProps: { shading: { type: ShadingType.SOLID, fill: "b79c2f" } },
  alignments: {
    defaultVerticalAlign: VerticalAlignTable.CENTER,
    defaultHorizontalAlign: AlignmentType.CENTER,
    preferMdData: true,
  },
};

const blockNodeTypesThatCanComeInCell = [
  "paragraph",
  "heading",
  "code",
  "list",
  "blockquote",
  "thematicBreak",
  "fragment",
  "table",
];

/**
 * Plugin to convert Markdown tables (MDAST) to DOCX with support for rich formatting and seamless integration into mdast2docx.
 */
export const tablePlugin: (options?: ITablePluginProps) => IPlugin = options => {
  return {
    block: (docx, node, _paraProps, blockChildrenProcessor) => {
      if (node.type !== "table") return [];

      const { Table, TableRow, TableCell } = docx;

      const { tableProps, firstRowProps, firstRowCellProps, rowProps, cellProps, alignments } = {
        ...defaultTableOptions,
        ...options,
      };

      const align = (node.align as (string | null)[] | null)?.map(a => {
        switch (a) {
          case "left":
            return docx.AlignmentType.LEFT;
          case "right":
            return docx.AlignmentType.RIGHT;
          case "center":
            return docx.AlignmentType.CENTER;
          default:
            return undefined;
        }
      });

      const wrapInBlockNodeIfNeeded = (cell: { children: RootContent[] }) => {
        const children: RootContent[] = [];
        const tmp: PhrasingContent[] = [];
        for (node of cell.children) {
          if (blockNodeTypesThatCanComeInCell.includes(node.type)) {
            if (tmp.length > 0) {
              /* v8 ignore start - we will never reach here as html table cell is wrapped in fragment and markdown table can not contain block elements. Just want to put more thought before removing this */
              children.push({
                type: "paragraph",
                children: [...tmp],
              });
              tmp.length = 0;
            }
            /* v8 ignore stop */
            // @ts-expect-error - WIP
            children.push(node);
          } else {
            tmp.push(node as PhrasingContent);
          }
        }
        if (tmp.length > 0) {
          children.push({
            type: "paragraph",
            children: tmp,
          });
        }
        cell.children = children;
      };
      /**
       * Create table row
       */
      const createRow = (row: MdTableRow, rowIndex: number) =>
        new TableRow({
          ...rowProps,
          ...(rowIndex === 0 ? firstRowProps : {}),
          children: row.children.map((cell, cellIndex) => {
            wrapInBlockNodeIfNeeded(cell);
            return new TableCell({
              verticalAlign: alignments.defaultVerticalAlign,
              ...cellProps,
              ...(rowIndex === 0 ? firstRowCellProps : {}),
              children: blockChildrenProcessor(cell, {
                alignment: alignments.preferMdData
                  ? align?.[cellIndex]
                  : alignments.defaultHorizontalAlign,
              }),
            });
          }),
        });

      const rows = node.children.map(createRow);
      (node as unknown as EmptyNode)._type = node.type;
      // @ts-expect-error - Setting type to empty string to avoid re-processing the node.
      node.type = "";
      return [new Table({ ...tableProps, rows })];
    },
  };
};
