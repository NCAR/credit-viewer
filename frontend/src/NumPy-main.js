// TODO This is a temp main.js to test npy streaming
import { fromArrayBuffer } from "numpy-parser";


async function fetchNumpy() {
    const response = await fetch("/api/get_data");
    const arrayBuffer = await response.arrayBuffer();
    const { data, shape } = fromArrayBuffer(arrayBuffer);

    console.log("hi there");
    console.log(shape);
    console.log(data.slice(0, 20));
}

fetchNumpy().catch(console.error);
