#include <stdio.h>
#include <stdbool.h>
bool nto(int j){
    if(j<2)return 0;
 for(int i=2;i*i<=j;i++){
    if(j%i==0)return 0;
 }
 return 1;
}
bool num(int k){
    while(k>0){
        int dig=k%10;
        if(dig!=2&&dig!=3&&dig!=5&&dig!=7){
            return 0;
        }
        k/=10;
    }
    return 1;
}
int main (){
    int n,a,b;
scanf("%d",&n);
while(n--){
    int count=0;
    scanf("%d %d",&a ,&b);
    for(int o=a;o<=b;o++){
        if(num(o)&&nto(o )){
            count++;
        }
    }
    printf("%d\n",count);
}

}