// TODO This is a temp main.js to test apache-arrow


import * as arrow from 'apache-arrow';

async function fetchApacheData() {
  const response = await fetch("/api/get_data");
  const arrayBuffer = await response.arrayBuffer();

  // Parse Arrow table
  const table = arrow.tableFromIPC(arrayBuffer);

  // Access the column
  // // const column = table.getChild('numbers');
  const column = table.getChild('variable_data');
  const numbers = column.toArray();

  console.log("Total numbers:", numbers.length);
  console.log("First 10 numbers:", numbers.slice(0, 10));
}

fetchApacheData().catch(console.error);

