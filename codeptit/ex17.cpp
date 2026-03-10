#include <stdio.h>
#include <stdbool.h>
bool daucuoi(int n) {
    int a=n%10;
    while (n >= 10) {
             n/=10;
    }
    return a==n;
}

int main() {
    int t, n;
    scanf("%d", &t);  
    
    while (t--) {
        scanf("%d", &n);
        if(daucuoi(n)){
            printf("YES\n");
        }
        else
        printf("NO\n");
    }
    
    return 0;
}
