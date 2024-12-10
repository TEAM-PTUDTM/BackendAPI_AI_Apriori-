const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();
const port = 3000;

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

app.use(cors());

app.use(
  cors({
    origin: "http://127.0.0.1:8000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);
async function fetchTransactionsFromDatabase() {
  try {
    await sql.connect(config);
    const result = await sql.query(
      `SELECT 
        STRING_AGG(cts.MaSP, ', ') AS DanhSachMaSP
      FROM 
        donhang dh
      INNER JOIN 
        (
          SELECT DISTINCT 
            ctdh.MaDonHang, 
            cts.MaSP
          FROM 
            chitietdonhang ctdh
          INNER JOIN 
            chitietsanpham cts ON ctdh.MaChiTietSanPham = cts.MaChiTiet
        ) AS cts ON dh.MaDonHang = cts.MaDonHang
      GROUP BY 
        dh.MaDonHang;`
    );

    // Chuyển đổi kết quả thành danh sách các giao dịch (mảng sản phẩm cho từng giao dịch).
    const transactions = result.recordset.map((row) =>
      row.DanhSachMaSP.split(", ")
    );

    // Trả về danh sách giao dịch.
    return transactions;
  } catch (err) {
    console.error("Lỗi khi truy vấn cơ sở dữ liệu:", err);
    return [];
  }
}

// Hàm triển khai thuật toán Apriori.
function apriori(transactions, minSupport) {
  const itemsets = {}; // Đối tượng lưu trữ tần suất xuất hiện của các cặp sản phẩm.

  // Tạo các cặp sản phẩm và đếm tần suất.
  transactions.forEach((transaction) => {
    for (let i = 0; i < transaction.length; i++) {
      for (let j = i + 1; j < transaction.length; j++) {
        const pair = [transaction[i], transaction[j]].sort().join(","); // Tạo cặp và sắp xếp theo thứ tự.
        itemsets[pair] = (itemsets[pair] || 0) + 1; // Tăng số lần xuất hiện của cặp.
      }
    }
  });

  const totalTransactions = transactions.length; // Tổng số giao dịch.
  // Lọc các tập phổ biến dựa trên ngưỡng hỗ trợ tối thiểu.
  const frequentItemsets = Object.keys(itemsets).filter((itemset) => {
    const support = itemsets[itemset] / totalTransactions; // Tính độ hỗ trợ (support).
    return support >= minSupport; // Giữ lại các cặp có support lớn hơn hoặc bằng minSupport.
  });

  return frequentItemsets; // Trả về danh sách các tập phổ biến.
}

// API gợi ý sản phẩm.
app.get("/goi-y", async (req, res) => {
  const selectedProduct = req.query.MaSP; // Lấy mã sản phẩm từ query parameter.

  if (!selectedProduct) {
    return res.status(400).json({ error: "Mã sản phẩm là bắt buộc" }); // Kiểm tra nếu không có mã sản phẩm.
  }

  try {
    const transactions = await fetchTransactionsFromDatabase(); // Lấy danh sách giao dịch từ cơ sở dữ liệu.

    if (transactions.length === 0) {
      return res.status(404).json({ message: "Không có giao dịch nào." }); // Nếu không có giao dịch.
    }

    const frequentItemsets = apriori(transactions, 0.01); // Chạy thuật toán Apriori với ngưỡng support 1%.

    // Lọc ra các sản phẩm liên quan đến sản phẩm được chọn.
    const relatedProducts = frequentItemsets
      .filter((itemset) => {
        const items = itemset.split(","); // Tách các sản phẩm trong cặp.
        return items.includes(selectedProduct); // Kiểm tra cặp có chứa sản phẩm được chọn.
      })
      .map((itemset) => {
        const items = itemset
          .split(",")
          .filter((item) => item !== selectedProduct); // Lấy các sản phẩm còn lại trong cặp.
        return items;
      })
      .flat(); // Ghép tất cả các mảng con thành một mảng duy nhất.

    if (relatedProducts.length === 0) {
      return res
        .status(404)
        .json({ message: "Không có gợi ý nào cho sản phẩm này." });
    }
    // Truy vấn thông tin chi tiết cho các sản phẩm liên quan.
    const query = `
    SELECT 
      MaSP, 
      TenSP, 
      Gia, 
      PhanTramGiamGia, 
      MoTa, 
      MaDanhMuc, 
      MaNhaCungCap, 
      TrinhTrang,
      (SELECT TOP 1 HinhAnh 
       FROM hinhanh 
       WHERE hinhanh.MaSP = sp.MaSP 
       ORDER BY MaHinhAnh ASC) AS FirstImage
    FROM sanpham sp
    WHERE MaSP IN (${relatedProducts
      .map((sp) => `'${sp.replace("'", "''")}'`)
      .join(", ")});
  `;

    const result = await sql.query(query); // Truy vấn sản phẩm từ cơ sở dữ liệu.
    return res.json({ suggestedProducts: result.recordset }); // Trả về danh sách sản phẩm gợi ý.
  } catch (err) {
    console.error("Lỗi khi xử lý yêu cầu:", err); // Ghi log lỗi nếu có.
    return res.status(500).json({ error: "Đã xảy ra lỗi khi gợi ý sản phẩm." });
  }
});

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`); // In thông báo server đang chạy.
});
