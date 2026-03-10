#include <stdio.h>
#include <math.h>

int tongcs(int a) {
    int tong = 0;
    while (a > 0) {
        tong += a % 10;
        a /= 10;
    }
    return tong;
}

int laSmith(int n) {
    int tongChuSo = tongcs(n);
    int tongThuaSo = 0;
    int tmp = n;

    for (int i = 2; i * i <= tmp; i++) {
        while (tmp % i == 0) {
            tongThuaSo += tongcs(i);
            tmp /= i;
        }
    }
    if (tmp > 1) {
        tongThuaSo += tongcs(tmp);
    }

    return tongChuSo == tongThuaSo;
}

int main() {
    int n;
    scanf("%d", &n);
    if (laSmith(n)) {
        printf("YES\n");
    } else {
        printf("NO\n");
    }
    return 0;
}
