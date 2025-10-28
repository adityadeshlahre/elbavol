package server

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func NewServer() *echo.Echo {
	e := echo.New()
	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Prime is running")
	})
	return e
}
