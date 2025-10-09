import { tableFromIPC } from "apache-arrow";

async function fetchArrow() {
    const response = await fetch("/api/get_data");
    const arrayBuffer = await response.arrayBuffer();
    const table = tableFromIPC(new Uint8Array(arrayBuffer));

    const variable_data = table.getChild("variable_data").toArray();

    const metadata = table.schema.metadata;
    const rows = parseInt(metadata.get("rows"));
    const cols = parseInt(metadata.get("cols"));

    const reshaped_data = Array.from({ length: rows }, (_, i) =>
        variable_data.slice(i * cols, (i + 1) * cols)
    );

    console.log(rows, cols);
    console.log(reshaped_data[0].slice(0, 10));

}

fetchArrow().catch(console.error);
