module.exports = {
  handle: async (res, handler) => {
   

    try {
      const result = await handler();
      if (result) {
        return res.status(200).json({ success: true, data: result });
      } else {
        return res.status(500).json({ success: false, message: "Unexpected error" });
      }
    } catch (error) {
     
      return res.status(500).json({
        success: false,
        message: typeof error === "string" ? error :  (error.message || error.error || "Unexpected error")
      });
    }
  }
};