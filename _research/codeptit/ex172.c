#include <stdio.h>
#include <stdbool.h>
bool check(int n){
    int tong=0;
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0) return 0;
    }
    while(n>0){
        tong+=n%10;
        n/=10;
    }
    if(tong%5!=0)return 0;
    else return 1;
}
int main(){
    int a,sum=0;scanf("%d",&a);
     for(int i=0;i<=a;i++){
        if(check(i)){
            printf("%d ",i);
            sum++;
        }
     }
     printf("\n%d",sum);
}