import { tableFromIPC } from "apache-arrow";

async function fetchArrow() {
    const response = await fetch("/api/get_data");
    const arrayBuffer = await response.arrayBuffer();
    const table = tableFromIPC(new Uint8Array(arrayBuffer));

    const values = table.getChild("variable_data").toArray();
    // const reshaped = Array.from({ length: 200 }, (_, i) =>
      // values.slice(i * 400, (i + 1) * 400)
    // );

    console.log(values.length);
    console.log(values.slice(0, 10));

}

fetchArrow().catch(console.error);
