#include <stdio.h>
#include <stdbool.h>
#include <math.h>
bool check(int n){
    int rev=0,sum=0,og=n;
    while(n>0){
        sum+=n%10;
        if(n%10==4)return 0;
        rev=rev*10+n%10;
        n/=10;
    }
    if(sum%10!=0)return 0;
    if(rev!=og)return 0;
    else return 1;
}
int main(){
    int n;scanf("%d",&n);
    for(int i=0;i<n;i++){
        int a;scanf("%d",&a);
        int num=pow(10,a);
        for(int j=num/10;j<=num;j++){
            if(check(j)){
                printf("%d ",j);
            }
        }
        printf("\n");
    }
}