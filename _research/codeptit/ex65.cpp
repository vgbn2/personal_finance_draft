#include <stdio.h>
int tonguoc(int a){
    int sum=0;
    for(int j=1;j*j<a;j++){
        if(a%j==0){{
            if(j==(a/=j)){
                sum+=j;
            }
            else sum+= j +(a/=j);
        }
            
        }
    }
    return sum==a;
}

int main(){
int n;
scanf("%d",&n);
for(int i=2;i<n;i++){
    if(tonguoc(i))
printf("%d ",i);
}
}