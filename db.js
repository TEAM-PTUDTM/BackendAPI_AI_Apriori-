const sql = require("mssql");
const tfidf = require("tf-idf");
const KMeans = require("kmeans");

const config = {
  user: "sa",
  password: "123456",
  server: "localhost",
  database: "QLSHOP",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function connectAndQuery() {
  try {
    await sql.connect(config);
    console.log("Connected to SQL Server");

    // Truy vấn sản phẩm
    const result = await sql.query(
      "SELECT MaSP, TenSP, Gia, PhanTramGiamGia, MoTa FROM dbo.sanpham"
    );

    const products = result.recordset;
    const productDescriptions = products.map((product) => product.MoTa);
    const productNames = products.map((product) => product.TenSP);
    const productPrices = products.map((product) => product.Gia);

    // Chuyển đổi mô tả sản phẩm thành vector bằng TF-IDF
    const tfidfModel = new tfidf();
    productDescriptions.forEach((description) =>
      tfidfModel.addDocument(description)
    );

    // Tạo vector cho tên sản phẩm và mô tả
    const productVectors = productDescriptions.map((description, index) => {
      const nameVector = tfidfModel.listTerms(index).map((term) => term.tf);
      const priceVector = [productPrices[index]]; // Giá sản phẩm
      return [...nameVector, ...priceVector]; // Kết hợp tên và giá
    });

    // Áp dụng K-Means với K = 3 nhóm
    const kmeans = new KMeans({ k: 3 });
    const clusters = kmeans.cluster(productVectors);

    // In kết quả phân nhóm
    console.log("Các nhóm sản phẩm:");
    clusters.forEach((cluster, i) => {
      console.log(`Nhóm ${i + 1}:`);
      cluster.forEach((productIndex) => {
        console.log(
          `Sản phẩm: ${productNames[productIndex]} - Giá: ${productPrices[productIndex]} - Mô tả: ${productDescriptions[productIndex]}`
        );
      });
    });

    // Gợi ý sản phẩm tương tự cho một sản phẩm cụ thể
    const suggestedProducts = clusters[0]; // Gợi ý sản phẩm trong nhóm 1
    console.log("\nGợi ý sản phẩm tương tự:");
    suggestedProducts.forEach((productIndex) => {
      console.log(
        `Sản phẩm: ${productNames[productIndex]} - Giá: ${productPrices[productIndex]}`
      );
    });
  } catch (err) {
    console.error("Error connecting to SQL Server:", err);
  } finally {
    await sql.close();
  }
}

connectAndQuery();
