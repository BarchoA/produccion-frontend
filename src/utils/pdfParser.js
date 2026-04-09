import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return normalizeText(fullText);
}

function normalizeText(text) {
  return text
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOrderNumber(text) {
  const match = text.match(/Presupuesto:\s*#?([A-Z]+[0-9]+)/i);
  return match ? match[1].trim() : "";
}

function extractClientName(text) {
  // Ahora soporta nombres en mayúsculas, minúsculas, mixtos y usernames
  const match = text.match(/Para:\s*(.*?)\s*Tel:/i);
  return match ? match[1].trim() : "";
}

function extractClientPhone(text) {
  const matches = [...text.matchAll(/Tel:\s*(\+?\d+)/gi)];
  // primer teléfono = empresa, segundo = cliente
  if (matches.length > 1) return matches[1][1];
  return matches[0]?.[1] || "";
}

function extractSubtotal(text) {
  const match = text.match(/Sub total\s*\$?\s*([\d.]+)/i);
  return match ? Number(match[1]) : 0;
}

function extractItemsBlock(text) {
  const match = text.match(
    /Producto\s+Precio unitario\s+Cantidad\s+Total\s+(.+?)\s+(Políticas de privacidad|Términos de compra|Sub total)/i
  );

  return match ? match[1].trim() : "";
}

function extractItems(text) {
  const block = extractItemsBlock(text);
  if (!block) return [];

  const items = [];

  const regex =
    /([A-Za-zÁÉÍÓÚÑáéíóú0-9().,%\-\/ ]+?)\s+\$\s*([\d.]+)\s+(\d+)\s+\$\s*([\d.]+)/g;

  let match;
  while ((match = regex.exec(block)) !== null) {
    const description = match[1].trim();

    if (/^IVA/i.test(description)) continue;
    if (/^•\s*IVA/i.test(description)) continue;

    items.push({
      description,
      unit_value: Number(match[2]),
      quantity: Number(match[3]),
      line_total: Number(match[4]),
      linea: "",
    });
  }

  return items;
}

function extractOperationalDescription(text) {
  // Caso 1:
  // ... Términos de compra MODELO 14 - NUMERO 14 - TINTA AZUL Sub total ...
  let match = text.match(
    /Términos de compra\s+(.+?)\s+Sub total/i
  );
  if (match) return match[1].trim();

  // Caso 2:
  // ... Políticas de privacidad Sub total ...
  // aquí normalmente no hay detalle operativo adicional, entonces devolvemos vacío
  match = text.match(
    /Políticas de privacidad\s+(.+?)\s+Sub total/i
  );
  if (match) {
    const value = match[1].trim();
    if (/^\$?[\d.]+$/.test(value)) return "";
    return value;
  }

  return "";
}

function buildOrderDescription(items, operationalDescription) {
  if (operationalDescription) return operationalDescription;

  if (!items.length) return "";

  return items
    .map((item) => `${item.quantity} x ${item.description}`)
    .join(" | ");
}

export function extraerDatos(text) {
  const order_number = extractOrderNumber(text);
  const client_name = extractClientName(text) || "Sin nombre";
  const phone = extractClientPhone(text);
  const subtotal = extractSubtotal(text);
  const items = extractItems(text);
  const operationalDescription = extractOperationalDescription(text);

  return {
    order_number,
    client_name,
    phone,
    subtotal,
    descripcion_orden: buildOrderDescription(items, operationalDescription),
    items,
    operational_summary: {
      descripcion_orden: buildOrderDescription(items, operationalDescription),
    },
  };
}