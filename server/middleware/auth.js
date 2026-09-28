import jwt from "jsonwebtoken";

export function createAuthMiddleware(jwtSecret) {
  function authenticate(req, res, next) {
    const authorization = req.headers.authorization;
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ message: "Vui lòng đăng nhập" });
    try {
      req.user = jwt.verify(token, jwtSecret);
      next();
    } catch (error) {
      const message = error.name === "TokenExpiredError"
        ? "Phiên đăng nhập đã hết hạn"
        : "Token đăng nhập không hợp lệ";
      res.status(401).json({ message });
    }
  }

  function allow(...roles) {
    return (req, res, next) => roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: "Bạn không có quyền truy cập" });
  }

  return { authenticate, allow };
}
