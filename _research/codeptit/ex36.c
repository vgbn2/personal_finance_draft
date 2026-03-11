#include <stdio.h>
#include <math.h>
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a,count=0;scanf("%d",&a);
        for (int i = 1; i <= sqrt(a); i++) {
            if (a % i == 0)
            {
                if (i%2 == 0)
                   count++;
                if ((a/i) % 2 == 0)
                    count++;
                if (i*i==a&& i % 2 == 0)
                    count = count - 1;
                }
            }
            printf("%d\n",count);
}
}